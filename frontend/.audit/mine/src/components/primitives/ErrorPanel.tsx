import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const RESERVED = "error_code";

/**
 * Error panel for API transport/validation failures. Shows the machine-readable
 * error_code (if the backend returned the §4 envelope) plus a details dump —
 * verbatim; the frontend does not paraphrase failure reasons.
 */
export function ErrorPanel({
  title = "Request failed",
  message,
  errorCode,
  details,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  errorCode?: unknown;
  details?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const hasDetails =
    details !== undefined &&
    details !== null &&
    !(typeof details === "object" && !Array.isArray(details) && Object.keys(details as object).length === 0);

  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-lg border border-negative/40 bg-negative/8 p-4 text-sm",
        className,
      )}
    >
      <TriangleAlert size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-negative" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{title}</p>
        {message ? <p className="mt-1 text-mute">{message}</p> : null}
        {errorCode ? (
          <p className="mt-1 data-font text-xs text-mute">
            {RESERVED}: {String(errorCode)}
          </p>
        ) : null}
        {hasDetails ? (
          <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface p-2.5 font-mono text-[11px] leading-relaxed text-mute">
            {JSON.stringify(details, null, 2)}
          </pre>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 min-h-9 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-elevated"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
