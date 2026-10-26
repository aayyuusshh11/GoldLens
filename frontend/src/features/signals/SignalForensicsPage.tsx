import { RotateCcw, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { SignalAnalyzeDTO } from "../../types/api";
import { formatDateShort, formatInt } from "../../lib/formatters/format";
import { useApi, type Slice } from "../../app/ApiContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { SectionPanel } from "../../components/primitives/SectionPanel";
import { DataNotice } from "../../components/primitives/DataNotice";
import { LoadingState } from "../../components/states/LoadingState";
import { ErrorState } from "../../components/states/ErrorState";
import { EmptyState } from "../../components/states/EmptyState";
import { SeverityBadge } from "../../components/layout/Badges";
import { SpreadChart } from "../../components/charts/SpreadChart";
import { SignalDecisionPanel } from "./SignalDecisionPanel";

/**
 * Signal Forensics — one decision for the selected pair, from the settled
 * POST /api/signals/analyze route. The settled contract has NO per-date z
 * series and NO per-trade list, so there is no signal log to page through:
 * the refusal story (nulls, reason strip, data-quality block) is the forensics.
 */

/**
 * Slice boundary shared by the signal and history panels: skeleton while
 * loading, ErrorState when nothing exists, and last-good data (labeled) while
 * a refresh is in flight — refreshing never blanks previously loaded data.
 */
function SliceBoundary<T>({
  slice,
  refresh,
  label,
  skeleton,
  children,
}: {
  slice: Slice<T>;
  refresh: () => void;
  label: string;
  skeleton: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (slice.data !== null) {
    return (
      <div>
        {slice.refreshing && (
          <div className="mb-3">
            <DataNotice tone="warn" title={`Refreshing ${label.toLowerCase()}…`}>
              Updating from the API — the values below are the last good data.
            </DataNotice>
          </div>
        )}
        {slice.key === "error" && slice.error !== null && (
          <div className="mb-3">
            <DataNotice tone="warn" title="Refresh failed — showing the last good data">
              <p>{slice.error.message}</p>
              <button
                type="button"
                onClick={refresh}
                className="mt-2 text-xs font-medium text-gold hover:underline"
              >
                Retry {label.toLowerCase()}
              </button>
            </DataNotice>
          </div>
        )}
        {children(slice.data)}
      </div>
    );
  }
  if (slice.key === "error" && slice.error !== null) {
    return <ErrorState error={slice.error} title={`${label} failed`} onRetry={refresh} />;
  }
  return <>{skeleton}</>;
}

/** Verbatim warning rows: message rendered exactly as returned, with severity. */
function VerbatimWarnings({ warnings }: { warnings: SignalAnalyzeDTO["data_quality"]["warnings"] }) {
  if (warnings.length === 0) {
    return <p className="text-sm text-mute">No warnings returned with this block.</p>;
  }
  return (
    <ul className="space-y-2">
      {warnings.map((warning) => (
        <li key={`${warning.code}-${warning.message}`} className="flex flex-wrap items-start gap-2 text-sm">
          <SeverityBadge severity={warning.severity} />
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-warn">{warning.code}</span>{" "}
            <span className="text-ink">{warning.message}</span>
          </span>
          <span className="font-mono text-xs tabular text-mute">× {formatInt(warning.count)}</span>
        </li>
      ))}
    </ul>
  );
}

export function SignalForensicsPage() {
  const { selectedPair, signal, refreshSignal, history, refreshHistory } = useApi();

  return (
    <div>
      <PageHeader
        kicker="Signal Forensics"
        title={
          selectedPair === null
            ? "No pair selected"
            : "Why the strategy stayed out or acted — as of the latest stored date"
        }
        subtitle="The decision, reasons and data-quality gates exactly as POST /api/signals/analyze returns them. Research output, not advice."
        actions={
          selectedPair !== null && (
            <button
              type="button"
              onClick={refreshSignal}
              disabled={signal.refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 py-1 text-xs font-medium text-ink hover:border-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Re-analyze signal
            </button>
          )
        }
      />

      {selectedPair === null ? (
        <EmptyState
          title="No pair selected"
          body="Signal analysis runs for the selected pair — once pairs load, the latest decision appears here."
        />
      ) : (
        <>
          <SliceBoundary
            slice={signal}
            refresh={refreshSignal}
            label="Signal"
            skeleton={<LoadingState label="Analyzing selected pair…" rows={3} />}
          >
            {(sig) => (
              <div>
                <SignalDecisionPanel signal={sig} pair={selectedPair} />

                <section className="mt-6">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <ShieldAlert className="h-4 w-4 text-mute" aria-hidden />
                    Data quality behind this decision
                  </h2>
                  <p className="mt-1 text-sm text-mute">
                    The backend checks history sufficiency before it computes anything —
                    these panels explain why fields above may be missing.
                  </p>

                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    <SectionPanel
                      kicker="Data quality block"
                      title="History sufficiency for this pair"
                    >
                      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3">
                        <div>
                          <dt className="text-[11px] uppercase tracking-widest text-mute">
                            distinct_trade_dates
                          </dt>
                          <dd className="font-mono text-sm font-medium tabular text-ink">
                            {formatInt(sig.data_quality.distinct_trade_dates)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] uppercase tracking-widest text-mute">
                            latest_data_date
                          </dt>
                          <dd className="font-mono text-sm font-medium tabular text-ink">
                            {formatDateShort(sig.data_quality.latest_data_date)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] uppercase tracking-widest text-mute">
                            trading_days_available
                          </dt>
                          <dd className="font-mono text-sm font-medium tabular text-ink">
                            {formatInt(sig.data_quality.trading_days_available)}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-4">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-mute">
                          data_quality.warnings (verbatim)
                        </p>
                        <VerbatimWarnings warnings={sig.data_quality.warnings} />
                      </div>
                    </SectionPanel>

                    <SectionPanel
                      kicker="Context"
                      title="Recent sessions — raw closes (no z series exists)"
                      actions={
                        history.refreshing ? undefined : (
                          <button
                            type="button"
                            onClick={refreshHistory}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 py-1 text-xs font-medium text-ink hover:border-gold/60"
                          >
                            <RotateCcw className="h-3 w-3" aria-hidden />
                            Refresh history
                          </button>
                        )
                      }
                      caption="The settled API has no per-date z-score series — only raw observations. Gaps are missing closes, never zero-filled."
                    >
                      <SpreadChartContext />
                    </SectionPanel>
                  </div>
                </section>
              </div>
            )}
          </SliceBoundary>
        </>
      )}
    </div>
  );
}

/** History slice for the selected pair, rendered as chart context. */
function SpreadChartContext() {
  const { history, refreshHistory } = useApi();

  if (history.data === null) {
    if (history.key === "error" && history.error !== null) {
      return <ErrorState error={history.error} title="History failed" onRetry={refreshHistory} />;
    }
    return <LoadingState label="Loading recent sessions…" rows={4} wide />;
  }
  const observations = history.data.observations;
  if (observations.length === 0) {
    return (
      <EmptyState
        title="No observations for this pair"
        body="The history route returned no rows for these expiries — nothing to plot."
      />
    );
  }
  return (
    <div>
      {history.refreshing && (
        <div className="mb-3">
          <DataNotice tone="warn" title="Refreshing history…">
            Updating from the API — the chart below is the last good data.
          </DataNotice>
        </div>
      )}
      <SpreadChart observations={observations} />
    </div>
  );
}
