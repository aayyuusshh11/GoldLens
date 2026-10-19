import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import OverviewPage from "@/pages/OverviewPage";
import PairExplorerPage from "@/pages/PairExplorerPage";
import SignalForensicsPage from "@/pages/SignalForensicsPage";
import BacktestPage from "@/pages/BacktestPage";
import DataQualityPage from "@/pages/DataQualityPage";
import NotFoundPage from "@/pages/NotFoundPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/pair-explorer" element={<PairExplorerPage />} />
        <Route path="/signal-forensics" element={<SignalForensicsPage />} />
        <Route path="/backtest" element={<BacktestPage />} />
        <Route path="/data-quality" element={<DataQualityPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
