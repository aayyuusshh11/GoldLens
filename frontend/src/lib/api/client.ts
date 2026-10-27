import { ApiRequestError } from "./errors";

/**
 * Minimal typed HTTP client for the GoldLens data API.
 *
 * - Base URL comes from config (VITE_API_BASE_URL). An EMPTY base URL means
 *   same-origin (dev proxy): useful with vite server.proxy → 127.0.0.1:8000.
 * - Every non-2xx becomes an ApiRequestError preserving the settled contract
 *   error shape {error: {code, message, details}}; legacy shapes degrade
 *   safely: {detail: "..."} (string) and {detail: [...]} (FastAPI 422
 *   validation bodies) map to sensible codes, never invented data.
 * - Requests are aborted after REQUEST_TIMEOUT_MS and on caller-supplied
 *   signals (React cleanup), so cancelled screens cannot leak state updates.
 * - JSON parsing is defensive: malformed bodies surface as errors, never `any`.
 */

/**
 * 90s: the backend prewarms its quant dataset at startup (the cold load can
 * take ~60s), and signal/backtest requests arriving during that window queue
 * behind it. Any longer than this means the backend is genuinely stuck and an
 * error is the honest response.
 */
export const REQUEST_TIMEOUT_MS = 90_000;

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
export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== null) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Non-2xx body → ApiRequestError. Settled contract shape is
 * {error: {code, message, details}}; other shapes degrade safely:
 *  - {detail: "string"}  → legacy FastAPI HTTPException text (code http_<n>)
 *  - {detail: [{...}]}   → FastAPI request-validation 422 list → invalid_input
 */
function httpErrorFrom(status: number, body: unknown): ApiRequestError {
  if (isRecord(body) && isRecord(body.error)) {
    const error = body.error;
    const code = typeof error.code === "string" ? error.code : `http_${status}`;
    const message =
      typeof error.message === "string" ? error.message : `HTTP ${status}`;
    const details = isRecord(error.details) ? error.details : null;
    return new ApiRequestError({ kind: "http", code, message, status, details });
  }
  if (isRecord(body) && Array.isArray(body.detail)) {
    const parts = body.detail
      .map((item) => {
        if (isRecord(item)) {
          const loc = Array.isArray(item.loc) ? item.loc.join(".") : String(item.loc ?? "");
          const msg = typeof item.msg === "string" ? item.msg : "validation error";
          return `${loc}: ${msg}`;
        }
        return String(item);
      })
      .slice(0, 5);
    return new ApiRequestError({
      kind: "http",
      code: "invalid_input",
      message: parts.length > 0 ? parts.join("; ") : "Request failed validation",
      status,
      details: null,
    });
  }
  if (isRecord(body) && typeof body.detail === "string") {
    return new ApiRequestError({
      kind: "http",
      code: `http_${status}`,
      message: body.detail,
      status,
      details: null,
    });
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

  private async request(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    parse: (raw: unknown) => unknown,
    opts: RequestOptions = {},
  ): Promise<unknown> {
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
        method,
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
      let errorBody: unknown = null;
      try {
        errorBody = await response.json();
      } catch {
        // Non-JSON error bodies still produce a usable AppError.
      }
      throw httpErrorFrom(response.status, errorBody);
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

  /** GET + defensive JSON parse + contract validator (the `parse` callback). */
  async getJson<T>(
    path: string,
    parse: (raw: unknown) => T,
    opts: RequestOptions = {},
  ): Promise<T> {
    return (await this.request("GET", path, undefined, parse, opts)) as T;
  }

  /** POST JSON body + contract validator. Content-Type: application/json. */
  async postJson<T>(
    path: string,
    body: unknown,
    parse: (raw: unknown) => T,
    opts: RequestOptions = {},
  ): Promise<T> {
    return (await this.request("POST", path, body, parse, opts)) as T;
  }
}
