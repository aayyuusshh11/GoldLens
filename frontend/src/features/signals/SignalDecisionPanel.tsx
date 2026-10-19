import { CircleX } from "lucide-react";
import type { SignalDTO, StrategyConfigDTO } from "../../types/api";
import { formatDateShort, formatPrice, formatRatio } from "../../lib/formatters/format";
import { DataNotice } from "../../components/primitives/DataNotice";
import { ReasonList } from "../../components/primitives/ReasonList";
import { SectionPanel } from "../../components/primitives/SectionPanel";
import { SignalBadge, StatusBadge } from "../../components/layout/Badges";

/** Headline: the latest session's decision with its full honesty context. */
export function SignalDecisionPanel({
  signals,
  config,
}: {
  signals: SignalDTO[];
  config: StrategyConfigDTO;
}) {
  const latest = signals[signals.length - 1];
  if (latest === undefined) {
    return (
      <DataNotice tone="info" title="No signal rows available in this report">
        The pipeline returned an empty signals list for this dataset.
      </DataNotice>
    );
  }

  const zMissing = latest.z === null;
  const isNoTrade = latest.signal === "NO TRADE";

  return (
    <SectionPanel
      kicker="Latest session"
      title={`Decision on ${formatDateShort(latest.trade_date)}`}
      actions={
        <span className="flex items-center gap-2">
          <SignalBadge signal={latest.signal} />
          {latest.filters_ok ? (
            <StatusBadge tone="pos">filters ok</StatusBadge>
          ) : (
            <StatusBadge tone="warn">filters blocked</StatusBadge>
          )}
        </span>
      }
      caption={`position before decision: ${latest.position_before} · thresholds from config: entry ±${formatRatio(config.z_entry)}, exit ${formatRatio(config.z_exit)}, stop ±${formatRatio(config.stop_z)}`}
    >
      <dl className="flex flex-wrap gap-x-10 gap-y-3">
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">z on date</dt>
          <dd className="font-mono text-lg tabular text-ink">
            {latest.z === null ? <span className="text-mute">not computed</span> : formatRatio(latest.z)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Spread (₹)</dt>
          <dd className="font-mono text-lg tabular text-ink">
            {latest.spread === null ? (
              <span className="text-mute">not computed</span>
            ) : (
              formatPrice(latest.spread)
            )}
          </dd>
        </div>
        <div className="min-w-[16rem] flex-1">
          <dt className="text-[11px] uppercase tracking-widest text-mute">Pipeline rationale</dt>
          <dd className="mt-1">
            <ReasonList items={[latest.rationale, latest.no_trade_reason ?? undefined]} />
          </dd>
        </div>
      </dl>

      {!latest.filters_ok && (
        <div className="mt-3">
          <DataNotice tone="warn" title="Filters blocked a potential action on this date">
            <ReasonList items={[latest.filter_reason ?? undefined]} empty="No filter reason string was provided." />
          </DataNotice>
        </div>
      )}

      {zMissing && (
        <div className="mt-3">
          <DataNotice tone={isNoTrade ? "info" : "warn"} title="z not computed on this date">
            <span className="flex items-start gap-2">
              <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-mute" aria-hidden />
              <span>
                Rolling statistics require at least {config.min_hist_days} sessions of spread
                history (lookback {config.lookback_days}d). &quot;Not computed&quot; means the
                strategy deliberately stayed out — it is never a zero z-score.
              </span>
            </span>
          </DataNotice>
        </div>
      )}

      <p className="mt-3 text-xs text-mute">
        Signals describe the pipeline&apos;s own research output for that session — not a
        recommendation to trade.
      </p>
    </SectionPanel>
  );
}
