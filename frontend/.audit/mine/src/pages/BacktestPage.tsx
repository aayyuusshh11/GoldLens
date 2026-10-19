import { PageHeader } from "@/components/layout/PageHeader";
import { SectionPanel } from "@/components/primitives/SectionPanel";
import { DataNotice } from "@/components/primitives/DataNotice";
import { EmptyState } from "@/components/primitives/EmptyState";

export default function BacktestPage() {
  return (
    <div>
      <PageHeader
        kicker="Backtest"
        title="Out-of-sample record — with its validity"
        subtitle="Run configuration, metrics (gross vs net), trades, and the validity verdict exactly as the quant engine returns them."
      />
      <div className="space-y-4">
        <DataNotice tone="info" title="Backend not connected">
          This page renders a{" "}
          <code className="data-font text-xs">BacktestReportDTO</code> from the proposed{" "}
          <code className="data-font text-xs">POST /api/backtests/run</code>. No strategy
          logic runs in React, and no run status is asserted without the API.
        </DataNotice>
        <SectionPanel kicker="Planned content" title="What appears once the backend runs">
          <ul className="list-inside list-disc space-y-1.5 text-sm max-w-prose">
            <li>Validity banner: verdict + is_valid_backtest — impossible to miss.</li>
            <li>Config: lookback, thresholds, exec mode, folds, costs status.</li>
            <li>
              Metrics in ₹ with gross/net distinction; net withheld and labeled when
              costs are unconfigured.
            </li>
            <li>Trades table incl. zero-trade empty state; train/test + walk-forward when returned.</li>
          </ul>
        </SectionPanel>
      </div>
      <div className="mt-4">
        <EmptyState title="No backtest report loaded">
          A one-day exemplar is diagnostics only: 0 trades, no costs, null z. The page
          will refuse to call any report valid or profitable unless the backend says so.
        </EmptyState>
      </div>
    </div>
  );
}
