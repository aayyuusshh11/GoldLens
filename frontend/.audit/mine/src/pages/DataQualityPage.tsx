import { PageHeader } from "@/components/layout/PageHeader";
import { SectionPanel } from "@/components/primitives/SectionPanel";
import { DataNotice } from "@/components/primitives/DataNotice";
import { EmptyState } from "@/components/primitives/EmptyState";

export default function DataQualityPage() {
  return (
    <div>
      <PageHeader
        kicker="Data Quality"
        title="Can the inputs be trusted?"
        subtitle="Provenance, specification cross-checks, and eligibility findings exactly as the pipeline reports them."
      />
      <div className="space-y-4">
        <DataNotice tone="info" title="Backend not connected">
          Quality facts come from report provenance and the proposed{" "}
          <code className="data-font text-xs">GET /api/data-quality</code>. Until then the
          page reports what is unknown rather than what is clean.
        </DataNotice>
        <SectionPanel kicker="Planned content" title="What appears once the backend runs">
          <ul className="list-inside list-disc space-y-1.5 text-sm max-w-prose">
            <li>Provenance: date range, distinct trading days, import status.</li>
            <li>
              Spec cross-checks rendered verbatim (PASS/FAIL strings); absent checks
              shown as “No specification checks reported” — never “all passed”.
            </li>
            <li>
              Eligible/ineligible contracts with exact rejection reasons — filterable,
              searchable, paginated for large lists.
            </li>
            <li>Stale rows and missing values visible; never reported as clean.</li>
          </ul>
        </SectionPanel>
      </div>
      <div className="mt-4">
        <EmptyState title="No quality data loaded">
          A passing check here is evidence about that check only — missing fields will
          never be falsely presented as a clean dataset.
        </EmptyState>
      </div>
    </div>
  );
}
