/** Normalized application error surfaced by the data layer. */
export type ErrorKind =
  | "network" // fetch itself failed (offline, refused, CORS)
  | "timeout"
  | "http" // server responded with a non-2xx status
  | "schema" // payload did not match the expected contract
  | "unknown";

export interface AppError {
  kind: ErrorKind;
  /** Machine-readable code when the API supplied one (error_code). */
  code: string | null;
  message: string;
  status: number | null;
  details: Record<string, unknown> | null;
}

const QUANT_ERROR_CODES = new Set([
  "quant_error",
  "invalid_input_schema",
  "data_quality_rejected",
]);

export class ApiRequestError extends Error {
  readonly appError: AppError;

  constructor(appError: AppError) {
    super(appError.message);
    this.name = "ApiRequestError";
    this.appError = appError;
  }
}

/** True when the code matches the quant boundary's documented error codes. */
export function isQuantErrorCode(code: string): boolean {
  return QUANT_ERROR_CODES.has(code);
}

/** Coerce any thrown value into the normalized AppError shape. */
export function describeError(error: unknown): AppError {
  if (error instanceof ApiRequestError) return error.appError;
  const message = error instanceof Error ? error.message : String(error);
  return { kind: "unknown", code: null, message, status: null, details: null };
}

/**
 * One neutral, honest hint per error code/kind — shown under the error
 * message. No hint when none applies (never invent causes).
 */
export function quantErrorHint(code: string): string | null {
  switch (code) {
    case "data_quality_rejected":
      return "The quant boundary rejected this dataset for the selected symbol (no tradable calendar pair on the latest session). Try another symbol in the header — see docs/METHODOLOGY.md.";
    case "invalid_input_schema":
      return "The request did not match the API contract (docs/API_CONTRACT.md). Check the symbol/query parameters.";
    case "quant_error":
      return "The quant pipeline failed internally — see the backend logs; the UI renders the failure verbatim.";
    case "network":
      return "The backend was not reachable. Start it (uvicorn app.main:app), verify VITE_API_BASE_URL, or switch to VITE_DATA_MODE=fixture for the bundled sample.";
    case "timeout":
      return "The backend did not respond in time. If the report takes long on large datasets, the backend may need an async route.";
    case "schema":
      return "The response did not match the API contract — possible backend drift; compare with docs/API_CONTRACT.md.";
    case "http":
      return "The backend responded with an error status — see the code above and the backend logs.";
    default:
      return null;
  }
}
