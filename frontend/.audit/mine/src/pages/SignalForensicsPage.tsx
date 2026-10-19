import { PageHeader } from "@/components/layout/PageHeader";
import { SectionPanel } from "@/components/primitives/SectionPanel";
import { DataNotice } from "@/components/primitives/DataNotice";
import { EmptyState } from "@/components/primitives/EmptyState";

export default function SignalForensicsPage() {
  return (
    <div>
      <PageHeader
        kicker="Signal Forensics"
        title="Why this signal — or none"
        subtitle="Every decision the strategy produced, with the z-score state, filter outcomes, and returned rationale that explain it."
      />
      <div className="space-y-4">
        <DataNotice tone="info" title="Backend not connected">
          Forensics reads <code className="data-font text-xs">signal</code> rows and{" "}
          <code className="data-font text-xs">z_score</code> series returned by the backend
          (proposed <code className="data-font text-xs">POST /api/signals/analyze</code>).
          No decision is derived in the browser.
        </DataNotice>
        <SectionPanel kicker="Planned content" title="What appears once the backend runs">
          <ul className="list-inside list-disc space-y-1.5 text-sm max-w-prose">
            <li>Trade date, pair identity, spread, rolling mean/std, z.</li>
            <li>
              <code className="data-font text-xs">null</code> z/mean/std as “Not computed”
              with the backend’s reason (e.g. insufficient rolling history) — never zero.
            </li>
            <li>Filter failures shown separately from the statistical signal.</li>
            <li>
              Final decision prominent: a signal, or an explained{" "}
              <span className="font-medium">NO TRADE</span> treated as a legitimate outcome.
            </li>
          </ul>
        </SectionPanel>
      </div>
      <div className="mt-4">
        <EmptyState title="No signals loaded">
          Z-score null means not computed, not zero. NO TRADE with a stated reason is a
          valid analytical result, not an error.
        </EmptyState>
      </div>
    </div>
  );
}
