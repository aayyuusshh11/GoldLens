import { Link, BrowserRouter, Route, Routes } from "react-router-dom";
import { appConfig } from "../lib/api/config";
import { ApiProvider } from "./ApiContext";
import { AppShell } from "../components/layout/AppShell";
import { EmptyState } from "../components/states/EmptyState";
import { OverviewPage } from "../features/overview/OverviewPage";
import { PairExplorerPage } from "../features/pair/PairExplorerPage";
import { SignalForensicsPage } from "../features/signals/SignalForensicsPage";
import { BacktestPage } from "../features/backtest/BacktestPage";
import { EligibleContractsPage } from "../features/contracts/EligibleContractsPage";
import { DataQualityPage } from "../features/data-quality/DataQualityPage";

/**
 * Config problems (bad env values) are first-class states — the app renders
 * an explicit config screen rather than crashing or silently downgrading to
 * fixture data. Missing VITE_API_BASE_URL is NOT an error: live mode defaults
 * to same-origin requests through the Vite dev proxy.
 */
function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <div role="alert" className="rounded-xl border border-neg/40 bg-surface p-6">
        <h1 className="text-base font-semibold text-neg">Configuration error</h1>
        <p className="mt-2 text-sm text-mute">{message}</p>
        <p className="mt-4 text-xs text-mute">
          Check <span className="font-mono">frontend/.env.example</span> for valid values, or switch
          back to <span className="font-mono">VITE_DATA_MODE=fixture</span>.
        </p>
      </div>
    </div>
  );
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
  let config;
  try {
    config = appConfig();
  } catch (error) {
    return <ConfigErrorScreen message={error instanceof Error ? error.message : String(error)} />;
  }

  return (
    <ApiProvider config={config}>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/pair" element={<PairExplorerPage />} />
            <Route path="/signals" element={<SignalForensicsPage />} />
            <Route path="/backtest" element={<BacktestPage />} />
            <Route path="/contracts" element={<EligibleContractsPage />} />
            <Route path="/data-quality" element={<DataQualityPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </ApiProvider>
  );
}
