import type { BacktestReportDTO, MetricsDTO } from "../../types/api";
import { costsNotConfigured, netWithheldReason } from "../../lib/reportAnalysis";
import { MetricValue } from "../../components/primitives/MetricValue";
import { ReasonList } from "../../components/primitives/ReasonList";
import { DataNotice } from "../../components/primitives/DataNotice";
import { StatusBadge } from "../../components/layout/Badges";

/**
 * One metrics block (full / train / test) rendered with the costs honesty
 * model:
 *  - gross metrics always labeled "gross";
 *  - withheld net values render an explanation, never 0;
 *  - win_rate/sharpe are unit-less until the quant owner confirms scale.
 */
export function BacktestMetrics({
  report,
  metrics,
  variant,
}: {
  report: BacktestReportDTO;
  metrics: MetricsDTO | null;
  variant: "full" | "train" | "test";
}) {
  const costsMissing = costsNotConfigured(report);
  const withheld = netWithheldReason(report, metrics);
  const variantTitle = variant === "full" ? "Full-sample metrics" : `${variant} segment`;

  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">{variantTitle}</h3>
        <div className="flex items-center gap-2">
          <StatusBadge tone={variant === "full" ? "gold" : "mute"}>{variant}</StatusBadge>
          <StatusBadge
            tone={
              metrics === null
                ? "mute"
                : metrics.status === "diagnostics_only"
                  ? "warn"
                  : "pos"
            }
          >
            {metrics === null ? "no metrics block" : metrics.status}
          </StatusBadge>
        </div>
      </header>

      {metrics === null ? (
        <div className="px-4 py-4">
          <p className="text-sm text-mute">
            The pipeline did not produce this segment&apos;s metrics (e.g. too few observations
            for a split). Absent means absent — there is nothing hidden behind a zero here.
          </p>
        </div>
      ) : (
        <div className="px-4 py-4">
          <p className="mb-4 text-xs text-mute">
            Status: <span className="font-medium text-ink">{metrics.status}</span> ·{" "}
            {metrics.status === "diagnostics_only"
              ? "figures are diagnostics, not a validated backtest."
              : "produced under the pipeline's backtest assumptions."}{" "}
            Costs assumption:{" "}
            <span className="font-medium text-ink">{metrics.costs_assumption ?? "—"}</span>
          </p>

          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-mute">Sessions (n_days)</p>
              <MetricValue value={metrics.n_days} kind="int" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-mute">Trades (n_trades)</p>
              <MetricValue value={metrics.n_trades} kind="int" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-mute">Gross P&amp;L (₹)</p>
              <MetricValue
                value={metrics.gross_pnl_rupees}
                kind="signed_rupees"
                tone="sign"
                unavailable="Not computed"
                note="gross of costs"
              />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-mute">Max drawdown (₹, gross)</p>
              <MetricValue value={metrics.max_drawdown_rupees} kind="rupees" unavailable="Not computed" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-mute">Avg P&amp;L / trade (₹, gross)</p>
              <MetricValue
                value={metrics.avg_pnl_per_trade}
                kind="signed_rupees"
                tone="sign"
                unavailable="Not computed"
              />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-mute">Win rate</p>
              <MetricValue
                value={metrics.win_rate}
                kind="ratio"
                unavailable="Not computed"
                note="scale (fraction vs %) pending quant confirmation"
              />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-mute">Sharpe ratio</p>
              <MetricValue
                value={metrics.sharpe_ratio}
                kind="ratio"
                unavailable="Withheld — sample too short"
                note="annualization convention pending quant confirmation"
              />
            </div>
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-mute">
              Net metrics {withheld !== null ? "(withheld)" : "(costs configured)"}
            </p>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-mute">Net P&amp;L (₹)</p>
                <MetricValue
                  value={metrics.net_pnl_rupees}
                  kind="signed_rupees"
                  tone="sign"
                  unavailable="Withheld — costs not configured"
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest text-mute">Net Sharpe</p>
                <MetricValue
                  value={metrics.net_sharpe_ratio}
                  kind="ratio"
                  unavailable="Withheld — costs not configured"
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest text-mute">Net max drawdown (₹)</p>
                <MetricValue
                  value={metrics.net_max_drawdown_rupees}
                  kind="rupees"
                  unavailable="Withheld — costs not configured"
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest text-mute">Total transaction cost (₹)</p>
                <MetricValue
                  value={metrics.total_cost_rupees}
                  kind="rupees"
                  unavailable="Withheld — costs not configured"
                />
              </div>
            </div>
            {withheld !== null && (
              <div className="mt-3">
                <DataNotice tone={costsMissing ? "warn" : "info"} title="Why these net figures are missing">
                  {withheld}
                </DataNotice>
              </div>
            )}
          </div>

          {metrics.notes.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-mute">
                Pipeline notes (verbatim)
              </p>
              <ReasonList items={metrics.notes} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
