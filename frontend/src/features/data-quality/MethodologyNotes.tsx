import type { ReactNode } from "react";
import { SectionPanel } from "../../components/primitives/SectionPanel";
import { ReasonList } from "../../components/primitives/ReasonList";

/**
 * Static methodology reference rendered from the project docs
 * (docs/METHODOLOGY.md, docs/DATA_SCHEMA.md). Definitions only — no derived
 * numbers, no strategy claims. Items the quant owner must still confirm are
 * marked as pending instead of being guessed.
 */
export function MethodologyNotes() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionPanel kicker="Reference" title="What the pipeline computes">
        <ReasonList
          items={[
            "Spread: near-expiry vs far-expiry close (₹) for the selected pair on each session the legs are both valid.",
            "Rolling z-score: spread versus its own trailing history; requires min_hist_days inside the lookback window, otherwise z is not computed (null, never zero).",
            "Filters: per-day gates (e.g. expiry proximity, liquidity) that can block acting even when a threshold is crossed.",
            "Signals: LONG / SHORT / EXIT / NO TRADE labels with a per-date rationale written by the quant boundary.",
            "Backtest: entries execute per exec_mode (sample uses next_close), with stop and max-holding exits; gross P&L in ₹ shares full-lot rupee exposure.",
          ]}
        />
      </SectionPanel>

      <SectionPanel kicker="Reference" title="Honesty rules this UI enforces">
        <ReasonList
          items={[
            "is_valid_backtest=false ⇒ everything is labeled diagnostics, never performance.",
            "metrics.status=diagnostics_only ⇒ too few sessions for statistically meaningful figures.",
            "Costs absent ⇒ net P&L/Sharpe/drawdown are withheld; no net number is invented.",
            "Null z or null mean ⇒ shown as 'not computed', not as 0.",
            "Stale legs and crashed/blocked filters are visible, not smoothed away.",
          ]}
        />
      </SectionPanel>

      <SectionPanel kicker="Reference" title="Pending quant-owner confirmations">
        <ReasonList
          items={[
            "Exact spread sign convention (sample data implies far − near).",
            "win_rate scale (fraction vs percent) and Sharpe annualization convention.",
            "Walk-forward fold comparison column definitions.",
            "Stale-row definition and mode of pair rolling across expiries.",
          ]}
        />
        <p className="mt-3 text-xs text-mute">
          Tracked in docs/INTEGRATION_BLOCKERS.md. Until confirmed, the UI shows the
          values verbatim with neutral unit labels, never derivations.
        </p>
      </SectionPanel>

      <SectionPanel kicker="Reference" title="What this tool is not">
        <ReasonList
          items={[
            "Not a live feed: data is historical bhavcopy with stated provenance dates.",
            "Not advice: signals are the strategy's own research labels.",
            "Not a validated backtest until the validity gate passes with costs configured.",
          ]}
        />
      </SectionPanel>
    </div>
  );
}
