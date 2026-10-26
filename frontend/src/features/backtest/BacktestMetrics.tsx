import type { BacktestRunDTO, WarningItemDTO } from "../../types/api";
import { formatDateShort, formatInt } from "../../lib/formatters/format";
import { MetricValue } from "../../components/primitives/MetricValue";
import { ReasonList } from "../../components/primitives/ReasonList";
import { DataNotice } from "../../components/primitives/DataNotice";
import { SectionPanel } from "../../components/primitives/SectionPanel";
import { SeverityBadge, StatusBadge } from "../../components/layout/Badges";

/**
 * One settled backtest run (POST /api/backtests/run), rendered honestly:
 *  - runnable:false is the product — a prominent refusal notice, first.
 *  - metrics that the API returned as null render "— withheld" with the
 *    run's own warnings as the reason, verbatim. Never a fabricated 0.
 *  - counts (observation_count, completed_trades) always render as returned.
 */

function WithheldReasons({ warnings }: { warnings: WarningItemDTO[] }) {
  if (warnings.length === 0) {
    return (
      <p className="text-sm text-mute">No warning was attached to this run for the missing values.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {warnings.map((warning) => (
        <li key={`${warning.code}-${warning.message}`} className="flex flex-wrap items-start gap-2 text-sm">
          <SeverityBadge severity={warning.severity} />
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-warn">{warning.code}</span>{" "}
            <span className="text-ink">{warning.message}</span>
          </span>
          <span className="font-mono text-xs tabular text-mute">× {formatInt(warning.count)}</span>
        </li>
      ))}
    </ul>
  );
}

export function BacktestMetrics({ run }: { run: BacktestRunDTO }) {
  const anyNull =
    run.gross_pnl === null ||
    run.estimated_costs === null ||
    run.net_pnl === null ||
    run.max_drawdown === null;
  const period = run.evaluation_period;

  return (
    <SectionPanel
      kicker="Backtest run"
      title={`${run.pair_id} · strategy ${run.strategy_version}`}
      actions={
        run.runnable ? (
          <StatusBadge tone="pos" title="The backend marked this evaluation runnable.">
            runnable
          </StatusBadge>
        ) : (
          <StatusBadge tone="neg" title="The backend refused to evaluate this run.">
            refused · runnable false
          </StatusBadge>
        )
      }
      caption={`run_id: ${run.run_id} · strategy_version: ${run.strategy_version} · values render exactly as the API returned them (null → withheld, never 0)`}
    >
      {!run.runnable && (
        <div className="mb-4">
          <DataNotice tone="danger" title="Evaluation refused — runnable is false">
            <span className="flex flex-col gap-2">
              <span>
                The backend refuses to treat this as a valid strategy evaluation until its
                history gate is met. Nothing below is fabricated; the run&apos;s own warnings
                are the reasons:
              </span>
              <ul className="space-y-2">
                {run.warnings.map((warning) => (
                  <li key={`${warning.code}-${warning.message}`} className="flex flex-wrap items-start gap-2 text-sm">
                    <SeverityBadge severity={warning.severity} />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-warn">{warning.code}</span>{" "}
                      <span className="text-ink">{warning.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </span>
          </DataNotice>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Evaluation period</dt>
          <dd className="font-mono text-sm font-medium tabular text-ink">
            {formatDateShort(period.start_date)} → {formatDateShort(period.end_date)}
          </dd>
          {(period.start_date === null || period.end_date === null) && (
            <dd className="mt-0.5 text-[11px] text-mute">
              null boundary = no window of that kind stored for this run
            </dd>
          )}
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Observations</dt>
          <dd className="font-mono text-sm font-medium tabular text-ink">
            {formatInt(run.observation_count)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Completed trades</dt>
          <dd className="font-mono text-sm font-medium tabular text-ink">
            {formatInt(run.completed_trades)}
          </dd>
        </div>
      </dl>

      <div className="mt-6 border-t border-line pt-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-mute">
          Performance figures {anyNull ? "(withheld)" : "(as returned by the quant service)"}
        </p>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-mute">Gross P&amp;L (₹)</p>
            <MetricValue
              value={run.gross_pnl}
              kind="signed_rupees"
              tone="sign"
              unavailable="— withheld"
              note="gross of costs"
            />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-mute">Estimated costs (₹)</p>
            <MetricValue value={run.estimated_costs} kind="rupees" unavailable="— withheld" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-mute">Net P&amp;L (₹)</p>
            <MetricValue
              value={run.net_pnl}
              kind="signed_rupees"
              tone="sign"
              unavailable="— withheld"
            />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-mute">Max drawdown (₹)</p>
            <MetricValue value={run.max_drawdown} kind="rupees" unavailable="— withheld" />
          </div>
        </div>

        {anyNull && (
          <div className="mt-3">
            <DataNotice tone="warn" title="Why the figures above are withheld — run warnings (verbatim)">
              <span className="flex flex-col gap-2">
                <span>
                  A null means not computed — the quant side (costs, analytics) is not wired
                  yet; the UI never fills it in.
                </span>
                <WithheldReasons warnings={run.warnings} />
              </span>
            </DataNotice>
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-line pt-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-mute">
          Assumptions (verbatim)
        </p>
        <ReasonList items={run.assumptions} empty="No assumptions were returned for this run." />
      </div>
    </SectionPanel>
  );
}
