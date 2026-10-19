import type { BacktestReportDTO } from "../../types/api";
import { formatDateShort, formatInt } from "../../lib/formatters/format";
import { PageHeader } from "../../components/layout/PageHeader";
import { ConfigChips } from "../../components/layout/ConfigChips";
import { StatusBadge, ValidityBadge } from "../../components/layout/Badges";
import { InvalidReportNotice } from "./InvalidReportNotice";
import { BacktestMetrics } from "./BacktestMetrics";
import { TradesTable } from "./TradesTable";
import { WalkForwardTable } from "./WalkForwardTable";

export function BacktestPage({ report }: { report: BacktestReportDTO }) {
  const lastSession = report.data_provenance.date_range[1] ?? report.data_provenance.date_range[0] ?? null;

  return (
    <div>
      <PageHeader
        kicker="Backtest"
        title="Strategy performance — with every honesty gate visible"
        subtitle="Numbers come verbatim from the pipeline. Validity, costs and sample-size gates are shown; withheld values are not filled in."
        actions={<ValidityBadge isValid={report.is_valid_backtest} />}
      />

      <InvalidReportNotice report={report} />

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <StatusBadge tone="mute">run configuration (report.config)</StatusBadge>
        <span className="text-xs text-mute">
          Last session in data:{" "}
          <span className="font-mono tabular text-ink">{formatDateShort(lastSession)}</span>
        </span>
      </div>

      <div className="mt-3">
        <ConfigChips report={report} idPrefix="bt" />
      </div>

      <div className="mt-4 space-y-4">
        <BacktestMetrics report={report} metrics={report.metrics} variant="full" />
        {report.train_metrics !== null && (
          <BacktestMetrics report={report} metrics={report.train_metrics} variant="train" />
        )}
        {report.test_metrics !== null && (
          <BacktestMetrics report={report} metrics={report.test_metrics} variant="test" />
        )}
      </div>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4 md:p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Walk-forward folds ({formatInt(report.walk_forward_cmp.length)})
        </h2>
        <WalkForwardTable entries={report.walk_forward_cmp} foldsExpected={report.config.walk_forward_folds} />
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4 md:p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Trades ({formatInt(report.trades.length)})</h2>
        <TradesTable trades={report.trades} />
      </section>
    </div>
  );
}
