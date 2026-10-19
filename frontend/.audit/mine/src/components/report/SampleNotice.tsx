import { X } from "lucide-react";
import { DataNotice } from "@/components/primitives/DataNotice";
import { SAMPLE_REPORT_LABEL, samplePreviewSummary } from "@/lib/api/sample";

/**
 * Persistent notice shown whenever the loaded report is the supplied sample —
 * it must stay visible while any sample-derived content is on screen
 * (Implementation PROMPT 4/7 rules + skills.md §13).
 */
export function SampleNotice({ onClose }: { onClose?: () => void }) {
  return (
    <DataNotice tone="warn" title={SAMPLE_REPORT_LABEL}>
      {samplePreviewSummary() ? <p>Backend verdict status: {samplePreviewSummary()}</p> : null}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-xs font-medium text-ink hover:bg-elevated"
        >
          <X size={12} aria-hidden="true" /> Remove sample report
        </button>
      ) : null}
    </DataNotice>
  );
}
