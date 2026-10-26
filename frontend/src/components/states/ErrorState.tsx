import { RotateCcw } from "lucide-react";
import type { AppError } from "../../lib/api/errors";
import { contractErrorHint } from "../../lib/api/errors";
import { StatusBadge } from "../layout/Badges";

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return "(unserializable)";
  }
}

/**
 * API/state failure view for AppError (lib/api/errors). Shows the pipeline's
 * own error contract verbatim, a neutral hint, and a retry action. Never
 * pretends the request succeeded and never substitutes fixture data.
 */
export function ErrorState({
  error,
  title = "Request failed",
  onRetry,
  retryLabel = "Retry request",
  hint,
}: {
  error: AppError;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  hint?: string;
}) {
  const detailEntries = Object.entries(error.details ?? {});
  const suggestion = hint ?? contractErrorHint(error.code ?? error.kind);

  return (
    <div role="alert" className="rounded-xl border border-neg/40 bg-surface px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neg">{title}</h3>
          <p className="mt-1 text-sm text-mute">{error.message}</p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {error.code !== null && <StatusBadge tone="neg">{error.code}</StatusBadge>}
          <StatusBadge tone="mute">{error.kind}</StatusBadge>
        </span>
      </div>

      {error.status !== null && (
        <p className="mt-2 text-xs text-mute">
          HTTP status: <span className="font-mono tabular">{error.status}</span>
        </p>
      )}

      {detailEntries.length > 0 && (
        <dl className="mt-3 space-y-1 rounded-lg border border-line bg-elevated px-3 py-2 text-xs">
          {detailEntries.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <dt className="shrink-0 font-semibold text-mute">{key}:</dt>
              <dd className="min-w-0 break-words font-mono text-mute">{stringifyValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {suggestion !== null && <p className="mt-3 text-xs text-mute">{suggestion}</p>}

      {onRetry !== undefined && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-1.5 text-sm font-medium text-ink hover:border-gold/60"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
