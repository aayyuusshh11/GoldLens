import type { BacktestReportDTO } from "../../types/api";
import { VALIDITY_GATE_MIN_OBSERVATIONS } from "../../lib/reportAnalysis";
import { formatInt } from "../../lib/formatters/format";
import { DataNotice } from "../../components/primitives/DataNotice";
import { StatusBadge } from "../../components/layout/Badges";

/**
 * The backtest verdict is rendered prominently above every metric (SKILLS.md):
 * an invalid run must be read as diagnostics, never as performance.
 */
export function InvalidReportNotice({ report }: { report: BacktestReportDTO }) {
  if (report.is_valid_backtest) {
    return (
      <DataNotice
        tone="pos"
        title={`Valid backtest (≥ ${VALIDITY_GATE_MIN_OBSERVATIONS} spread observations)`}
      >
        <span className="inline-flex flex-wrap items-center gap-2 text-mute">
          Produced under the pipeline&apos;s assumptions; see metrics.notes for caveats.
          <StatusBadge tone="mute">{formatInt(report.metrics?.n_trades ?? 0)} trades recorded</StatusBadge>
        </span>
      </DataNotice>
    );
  }

  return (
    <DataNotice tone="danger" title="Diagnostics only — this is NOT a valid backtest">
      <p className="max-w-3xl leading-relaxed">{report.verdict}</p>
      <p className="mt-2 max-w-3xl">
        Why: the validity gate needs ≥ {VALIDITY_GATE_MIN_OBSERVATIONS} spread observations and
        this dataset has {formatInt(report.spread_observations.length)}. Signals below remain
        inspectable for forensics, but metrics on this page must be read as diagnostics of the
        run — not as strategy performance.
      </p>
    </DataNotice>
  );
}
