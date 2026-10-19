import { ApiRequestError } from "./errors";

/**
 * Minimal typed HTTP client for the GoldLens API.
 *
 * - Base URL comes from config (VITE_API_BASE_URL). No hardcoded hosts.
 * - Every non-2xx becomes an ApiRequestError preserving the API's
 *   {error_code, message, details} contract; unknown bodies degrade safely.
 * - Requests are aborted after REQUEST_TIMEOUT_MS and on caller-supplied
 *   signals (React cleanup), so cancelled screens cannot leak state updates.
 * - JSON parsing is defensive: malformed bodies surface as errors, never `any`.
 */

export const REQUEST_TIMEOUT_MS = 30_000;

export interface RequestOptions {
  /** Additional caller-controlled cancellation (e.g. React unmount). */
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Uses the browser JSON parser; malformed payloads surface as schema errors. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiRequestError({
      kind: "schema",
      code: null,
      message: "Response body was not valid JSON",
      status: response.status,
      details: null,
    });
  }
}

/** "?symbol=GOLDM" / "" — skips undefined/empty values, no trailing junk. */
export function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function httpErrorFrom(status: number, body: unknown): ApiRequestError {
  if (isRecord(body)) {
    const code =
      typeof body.error_code === "string"
        ? body.error_code
        : typeof body.detail === "string"
          ? "http_error" // FastAPI-style {detail: "..."} bodies
          : `http_${status}`;
    const message =
      typeof body.message === "string"
        ? body.message
        : typeof body.detail === "string"
          ? body.detail
          : `HTTP ${status}`;
    const details = isRecord(body.details) ? body.details : null;
    return new ApiRequestError({ kind: "http", code, message, status, details });
  }
  return new ApiRequestError({
    kind: "http",
    code: `http_${status}`,
    message: `HTTP ${status}`,
    status,
    details: null,
  });
}

export class HttpClient {
  constructor(private readonly baseUrl: string) {}

  /**
   * GET + defensive JSON parse + contract validator (the `parse` callback).
   * The parser owns typing: parse(raw: unknown) => T or throw ApiRequestError.
   */
  async getJson<T>(
    path: string,
    parse: (raw: unknown) => T,
    opts: RequestOptions = {},
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new ApiRequestError({
        kind: "unknown",
        code: "config_error",
        message: "API base URL is not configured (VITE_API_BASE_URL)",
        status: null,
        details: null,
      });
    }
    if (opts.signal?.aborted) {
      throw new ApiRequestError({
        kind: "unknown",
        code: "cancelled",
        message: "Request cancelled",
        status: null,
        details: null,
      });
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onExternalAbort, { once: true });

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (cause) {
      const kind = timedOut || opts.signal?.aborted ? "timeout" : "network";
      throw new ApiRequestError({
        kind,
        code: timedOut ? "timeout" : opts.signal?.aborted ? "cancelled" : "network_error",
        message:
          timedOut || opts.signal?.aborted
            ? "Request cancelled/timed out before completion"
            : cause instanceof Error
              ? cause.message
              : String(cause),
        status: null,
        details: null,
      });
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onExternalAbort);
    }

    if (!response.ok) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // Non-JSON error bodies still produce a usable AppError.
      }
      throw httpErrorFrom(response.status, body);
    }

    const raw = await readJson(response);
    try {
      return parse(raw);
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      throw new ApiRequestError({
        kind: "schema",
        code: null,
        message: error instanceof Error ? error.message : String(error),
        status: response.status,
        details: null,
      });
    }
  }
}
