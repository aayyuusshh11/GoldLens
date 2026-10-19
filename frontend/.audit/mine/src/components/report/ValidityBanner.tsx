import type { BacktestReportDTO } from "@/lib/api/types";
import { isDiagnosticsOnly } from "@/lib/report/analysis";
import { StatusBadge } from "@/components/layout/Badges";
import { DataNotice } from "@/components/primitives/DataNotice";

/**
 * Validity banner — the validity status must be impossible to miss
 * (Implementation PROMPT 7; skills.md §7). Verdict text renders verbatim.
 * Validity comes only from the report's own fields.
 */
export function ValidityBanner({ report, className }: { report: BacktestReportDTO; className?: string }) {
  if (!report.is_valid_backtest) {
    return (
      <DataNotice tone="critical" title={`NOT a valid backtest${isDiagnosticsOnly(report) ? " — diagnostics only" : ""}`} className={className}>
        {report.verdict ? (
          <p>
            Backend verdict (verbatim): <span className="data-font text-xs">{report.verdict}</span>
          </p>
        ) : null}
        <p>
          Metrics on this page are research diagnostics — they must not be read as
          performance.
        </p>
      </DataNotice>
    );
  }
  if (isDiagnosticsOnly(report)) {
    return (
      <DataNotice tone="warn" title="Diagnostics only" className={className}>
        {report.verdict ? <p>{report.verdict}</p> : null}
      </DataNotice>
    );
  }
  return (
    <div className={className}>
      <StatusBadge tone="pos">Valid backtest</StatusBadge>
    </div>
  );
}
