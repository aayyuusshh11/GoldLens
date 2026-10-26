/** Normalized application error surfaced by the data layer. */
export type ErrorKind =
  | "network" // fetch itself failed (offline, refused, CORS)
  | "timeout"
  | "http" // server responded with a non-2xx status
  | "schema" // payload did not match the expected contract
  | "unknown";

export interface AppError {
  kind: ErrorKind;
  /** Machine-readable code when the API supplied one (settled: error.code). */
  code: string | null;
  message: string;
  status: number | null;
  details: Record<string, unknown> | null;
}

export class ApiRequestError extends Error {
  readonly appError: AppError;

  constructor(appError: AppError) {
    super(appError.message);
    this.name = "ApiRequestError";
    this.appError = appError;
  }
}

/** Coerce any thrown value into the normalized AppError shape. */
export function describeError(error: unknown): AppError {
  if (error instanceof ApiRequestError) return error.appError;
  const message = error instanceof Error ? error.message : String(error);
  return { kind: "unknown", code: null, message, status: null, details: null };
}

/**
 * One neutral, honest hint per settled-contract code/kind — shown under the
 * error message. Codes per docs/API_CONTRACT.md §0: invalid_input |
 * not_found | data_unavailable | internal_error. No hint when none applies
 * (never invent causes).
 */
export function contractErrorHint(code: string): string | null {
  switch (code) {
    case "not_found":
      return "The requested route or pair_id does not exist. Pair ids come from GET /api/pairs — refresh the pair list and retry.";
    case "invalid_input":
      return "The request did not match the API contract (dates must be YYYY-MM-DD; body fields per docs/API_CONTRACT.md).";
    case "data_unavailable":
      return "The backend storage is empty or unavailable. Ingest the CSV first: POST /api/ingest with the file path, or backend CLI.";
    case "internal_error":
      return "The backend failed while handling the request — see the backend logs; the UI renders the failure verbatim.";
    case "network":
      return "The backend was not reachable. Start it (uvicorn app.main:app in backend/), verify VITE_API_BASE_URL / the dev proxy, or switch to VITE_DATA_MODE=fixture.";
    case "timeout":
      return "The backend did not respond in time. Slow ingests or cold DuckDB reads can cause this; retry.";
    case "schema":
      return "The response did not match the API contract — possible backend drift; compare with backend/app/schemas (backend branch) and docs/API_CONTRACT.md.";
    case "http":
      return "The backend responded with an error status — see the code above and the backend logs.";
    default:
      return null;
  }
}
