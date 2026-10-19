import type { ReactNode } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import type { BacktestReportDTO } from "../types/api";
import { appConfig } from "../lib/api/config";
import { ReportProvider, useReport } from "./ReportContext";
import { AppShell } from "../components/layout/AppShell";
import { LoadingState } from "../components/states/LoadingState";
import { ErrorState } from "../components/states/ErrorState";
import { DataNotice } from "../components/primitives/DataNotice";
import { EmptyState } from "../components/states/EmptyState";
import { formatDateShort } from "../lib/formatters/format";
import { OverviewPage } from "../features/overview/OverviewPage";
import { PairExplorerPage } from "../features/pair/PairExplorerPage";
import { SignalForensicsPage } from "../features/signals/SignalForensicsPage";
import { BacktestPage } from "../features/backtest/BacktestPage";
import { EligibleContractsPage } from "../features/contracts/EligibleContractsPage";
import { DataQualityPage } from "../features/data-quality/DataQualityPage";

/**
 * Config problems (e.g. live mode without a base URL) are first-class states —
 * the app renders an explicit config screen rather than crashing or silently
 * downgrading to fixture data.
 */
function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <div role="alert" className="rounded-xl border border-neg/40 bg-surface p-6">
        <h1 className="text-base font-semibold text-neg">Configuration error</h1>
        <p className="mt-2 text-sm text-mute">{message}</p>
        <p className="mt-4 text-xs text-mute">
          Check <span className="font-mono">frontend/.env.example</span> and set{" "}
          <span className="font-mono">VITE_API_BASE_URL</span>, or switch back to{" "}
          <span className="font-mono">VITE_DATA_MODE=fixture</span>.
        </p>
      </div>
    </div>
  );
}

/**
 * Gate that maps the provider's entry state to page UI:
 *  - loading → skeleton placeholders;
 *  - error without cached data → error state + retry;
 *  - error WITH cached data → transparent stale-notice + last good report;
 *  - ready → the page, with verbatim report content.
 */
function ReportGate({ render }: { render: (report: BacktestReportDTO) => ReactNode }) {
  const { entry, refresh } = useReport();

  if (entry.key === "idle" || entry.key === "loading") {
    return (
      <div className="py-10">
        <LoadingState wide rows={6} label={`Loading ${entry.symbol} report…`} />
      </div>
    );
  }

  if (entry.key === "error") {
    const staleReport = entry.report;
    if (staleReport !== null) {
      return (
        <div className="space-y-4">
          <ErrorState
            error={entry.error}
            title="Refresh failed — continuing with last good data"
            onRetry={refresh}
          />
          <DataNotice tone="warn" title="Stale data notice">
            The views below render the previous successful report (symbol{" "}
            <span className="font-mono tabular">{staleReport.pair.symbol}</span>; data ends{" "}
            {formatDateShort(staleReport.data_provenance.date_range[1] ?? staleReport.data_provenance.date_range[0] ?? null)}).
            This is not live data — retry above to re-validate.
          </DataNotice>
          {render(staleReport)}
        </div>
      );
    }
    return <ErrorState error={entry.error} title="Could not load report" onRetry={refresh} />;
  }

  return <>{render(entry.report)}</>;
}

function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      body={
        <span>
          Use the navigation, or{" "}
          <Link to="/" className="text-gold hover:underline">
            return to Overview
          </Link>
          .
        </span>
      }
    />
  );
}

export default function App() {
  try {
    appConfig();
  } catch (error) {
    return <ConfigErrorScreen message={error instanceof Error ? error.message : String(error)} />;
  }

  return (
    <ReportProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route
              path="/"
              element={<ReportGate render={(report) => <OverviewPage report={report} />} />}
            />
            <Route
              path="/pair"
              element={<ReportGate render={(report) => <PairExplorerPage report={report} />} />}
            />
            <Route
              path="/signals"
              element={<ReportGate render={(report) => <SignalForensicsPage report={report} />} />}
            />
            <Route
              path="/backtest"
              element={<ReportGate render={(report) => <BacktestPage report={report} />} />}
            />
            <Route
              path="/contracts"
              element={<ReportGate render={(report) => <EligibleContractsPage report={report} />} />}
            />
            <Route
              path="/data-quality"
              element={<ReportGate render={(report) => <DataQualityPage report={report} />} />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </ReportProvider>
  );
}
