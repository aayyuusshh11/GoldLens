import { PageHeader } from "@/components/layout/PageHeader";
import { SectionPanel } from "@/components/primitives/SectionPanel";
import { DataNotice } from "@/components/primitives/DataNotice";
import { EmptyState } from "@/components/primitives/EmptyState";

export default function PairExplorerPage() {
  return (
    <div>
      <PageHeader
        kicker="Pair Explorer"
        title="Spread behavior over time"
        subtitle="Near/far expiry pairs for a contract family, their historical spreads, and the quality flags the pipeline attached to each observation."
      />
      <div className="space-y-4">
        <DataNotice tone="info" title="Backend not connected">
          Pair selection must be driven by the API (proposed{" "}
          <code className="data-font text-xs">GET /api/pairs</code> and{" "}
          <code className="data-font text-xs">GET /api/pairs/{"/"}history</code>). Without
          the backend, no pair list or spread history is shown and none is invented.
        </DataNotice>
        <SectionPanel kicker="Planned content" title="What appears once the backend runs">
          <ul className="list-inside list-disc space-y-1.5 text-sm max-w-prose">
            <li>Pair identity and legs as returned: symbol, near expiry, far expiry.</li>
            <li>
              Spread series (₹ spread points) only when real observations exist — with
              stale points flagged and missing points not interpolated.
            </li>
            <li>
              Per-observation detail: near/far closes, stale status, calendar gaps;
              plus contract eligibility/rejection reasons where returned.
            </li>
          </ul>
        </SectionPanel>
      </div>
      <div className="mt-4">
        <EmptyState title="No pair data loaded">
          Spread is a research input, not rupee P&L and not a guaranteed opportunity —
          the explorer will show it with units and definitions once data is connected.
        </EmptyState>
      </div>
    </div>
  );
}
