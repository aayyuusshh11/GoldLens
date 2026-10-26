import { useState } from "react";
import { Play } from "lucide-react";
import type { BacktestRunDTO } from "../../types/api";
import type { ReactNode } from "react";
import { useApi, type Slice } from "../../app/ApiContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataNotice } from "../../components/primitives/DataNotice";
import { LoadingState } from "../../components/states/LoadingState";
import { ErrorState } from "../../components/states/ErrorState";
import { EmptyState } from "../../components/states/EmptyState";
import { BacktestMetrics } from "./BacktestMetrics";

/**
 * Backtest — POST /api/backtests/run for the selected pair, with every
 * honesty gate visible. Dates default to the backend's own window; a refused
 * run (runnable:false) renders as a first-class result, not an error.
 */

function SliceBoundary({
  slice,
  refresh,
  children,
}: {
  slice: Slice<BacktestRunDTO>;
  refresh: () => void;
  children: (data: BacktestRunDTO) => ReactNode;
}) {
  if (slice.data !== null) {
    return (
      <div>
        {slice.refreshing && (
          <div className="mb-3">
            <DataNotice tone="warn" title="Refreshing backtest…">
              Updating from the API — the result below is the last good data.
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
                Retry backtest
              </button>
            </DataNotice>
          </div>
        )}
        {children(slice.data)}
      </div>
    );
  }
  if (slice.key === "error" && slice.error !== null) {
    return (
      <ErrorState error={slice.error} title="Backtest failed" onRetry={refresh} />
    );
  }
  return <LoadingState label="Running backtest…" rows={4} wide />;
}

const DATE_INPUT_CLASS =
  "rounded-lg border border-line bg-elevated px-2.5 py-1.5 font-mono text-sm text-ink focus:border-gold/60 focus:outline-none";

export function BacktestPage() {
  const { selectedPair, backtest, refreshBacktest, runBacktest } = useApi();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const hasCustomWindow = startDate !== "" || endDate !== "";
  /** ISO strings sort lexicographically, so YYYY-MM-DD compares correctly. */
  const windowInvalid = startDate !== "" && endDate !== "" && startDate > endDate;
  const busy = backtest.key === "loading" || backtest.refreshing;

  const canRun = selectedPair !== null && !windowInvalid && !busy;

  const handleRun = (): void => {
    if (selectedPair === null || windowInvalid) return;
    if (!hasCustomWindow) {
      // Same window as the auto-run on pair selection: route it through the
      // pair-id-keyed slice so the result below actually updates (visible
      // loading/refresh feedback).
      refreshBacktest();
      return;
    }
    runBacktest({
      pair_id: selectedPair.pair_id,
      start_date: startDate === "" ? null : startDate,
      end_date: endDate === "" ? null : endDate,
      strategy_version: "default",
    });
  };

  return (
    <div>
      <PageHeader
        kicker="Backtest"
        title="Strategy evaluation — refusals included"
        subtitle="The backend decides whether it can run at all. Metrics arrive only from the quant side; nulls render as withheld, never as zero."
      />

      {/* Run controls. */}
      <section aria-label="Run controls">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-widest text-mute">
              Start date (optional)
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={DATE_INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-widest text-mute">
              End date (optional)
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={DATE_INPUT_CLASS}
            />
          </label>
          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun}
            title={
              selectedPair === null
                ? "Select a pair first — the backtest runs per pair_id"
                : undefined
            }
            className="inline-flex items-center gap-2 rounded-lg border border-gold/60 bg-gold/10 px-3 py-1.5 text-sm font-semibold text-gold hover:border-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            {busy && !hasCustomWindow
              ? "Running…"
              : backtest.data !== null
                ? "Re-run"
                : "Run"}
          </button>
          <p className="pb-1.5 text-xs text-mute">
            strategy_version: <span className="font-mono">default</span> (fixed by the UI)
          </p>
        </div>

        {windowInvalid && (
          <div className="mt-3 max-w-xl">
            <DataNotice tone="warn" title="Start date is after end date">
              <p>Fix the window before running — the request is disabled to avoid a knowingly-empty call.</p>
            </DataNotice>
          </div>
        )}
        {hasCustomWindow && !windowInvalid && (
          <div className="mt-3 max-w-2xl">
            <DataNotice tone="info" title="Custom-window run will be posted">
              <p>
                With dates set, Run posts your exact window via the API layer&apos;s
                per-parameter cache. The result panel keeps rendering this pair&apos;s
                default-window run — press Run with cleared dates to refresh it.
              </p>
            </DataNotice>
          </div>
        )}
      </section>

      {/* Result. */}
      <div className="mt-6">
        {selectedPair === null ? (
          <EmptyState
            title="No pair selected"
            body="A backtest runs for the selected pair — once pairs load, choose one and run here."
          />
        ) : (
          <SliceBoundary slice={backtest} refresh={refreshBacktest}>
            {(run) => <BacktestMetrics run={run} />}
          </SliceBoundary>
        )}
      </div>
    </div>
  );
}
