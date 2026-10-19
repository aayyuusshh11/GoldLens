import { Link } from "react-router-dom";
import { ArrowLeftRight, Crosshair, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { BacktestReportDTO } from "../../types/api";
import {
  VALIDITY_GATE_MIN_OBSERVATIONS,
  costsNotConfigured,
  countStale,
  dateRangeLabel,
  eligibleCounts,
  parseSpecChecks,
  signalLabelCounts,
} from "../../lib/reportAnalysis";
import { formatInt } from "../../lib/formatters/format";
import { PageHeader } from "../../components/layout/PageHeader";
import { SectionPanel } from "../../components/primitives/SectionPanel";
import { DataNotice } from "../../components/primitives/DataNotice";
import { MetricsStatusBadge, StatusBadge, ValidityBadge } from "../../components/layout/Badges";

function KeyValueRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line/60 py-2 last:border-b-0">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/**
 * Overview — the single place that answers "what does this run support, and
 * what does it explicitly not support?" before anyone reads a chart.
 */
export function OverviewPage({ report }: { report: BacktestReportDTO }) {
  const costsMissing = costsNotConfigured(report);
  const specChecks = parseSpecChecks(report.data_provenance.spec_checks);
  const specPass = specChecks.filter((c) => c.ok).length;
  const specFail = specChecks.length - specPass;
  const counts = eligibleCounts(report.eligible_contracts);
  const staleCount = countStale(report.spread_observations);
  const labelCounts = signalLabelCounts(report.signals);

  return (
    <div>
      <PageHeader
        kicker="Overview"
        title={`Report — ${report.pair.symbol} calendar spread`}
        subtitle="Read the validity statements first. Numbers below only mean what their labels say."
      />

      {/* The verdict is the headline of the whole app — never buried. */}
      <div className="rounded-xl border border-line bg-surface p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <ValidityBadge isValid={report.is_valid_backtest} />
          <span className="text-sm text-mute">
            {formatInt(report.spread_observations.length)} spread observation(s) · validity gate ≥{" "}
            {VALIDITY_GATE_MIN_OBSERVATIONS}
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink">{report.verdict}</p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionPanel kicker="This run" title="Data under the report">
          <dl>
            <KeyValueRow label="Source coverage (session range)">
              <span className="font-mono tabular">{dateRangeLabel(report.data_provenance.date_range)}</span>
            </KeyValueRow>
            <KeyValueRow label="Distinct trading days in source">
              <span className="inline-flex items-center gap-2 font-mono tabular">
                {formatInt(report.data_provenance.trading_days)}
                {report.data_provenance.trading_days < VALIDITY_GATE_MIN_OBSERVATIONS && (
                  <StatusBadge
                    tone="warn"
                    title="Too little history for valid-backtest status or rolling statistics."
                  >
                    very short history
                  </StatusBadge>
                )}
              </span>
            </KeyValueRow>
            <KeyValueRow label="Pair (near / far expiry)">
              <span className="font-mono tabular">
                {report.pair.near_expiry ?? "—"} → {report.pair.far_expiry ?? "—"}
              </span>
            </KeyValueRow>
            <KeyValueRow label="Spec cross-checks">
              <span className="inline-flex flex-wrap items-center gap-2">
                {specChecks.length === 0 ? (
                  <span className="text-mute">none returned</span>
                ) : (
                  <>
                    <StatusBadge tone={specPass > 0 ? "pos" : "mute"}>{specPass} pass</StatusBadge>
                    {specFail > 0 && <StatusBadge tone="neg">{specFail} fail</StatusBadge>}
                  </>
                )}
              </span>
            </KeyValueRow>
            <KeyValueRow label="Stale observations (flagged by pipeline)">
              <span className="font-mono tabular">{formatInt(staleCount)}</span>
            </KeyValueRow>
          </dl>
        </SectionPanel>

        <SectionPanel kicker="This run" title="Metrics availability">
          <dl>
            <KeyValueRow label="Metrics status">
              <MetricsStatusBadge status={report.metrics === null ? null : report.metrics.status} />
            </KeyValueRow>
            <KeyValueRow label="Trades executed">
              <span className="font-mono tabular">
                {formatInt(report.metrics?.n_trades ?? 0)}
              </span>
            </KeyValueRow>
            <KeyValueRow label="Costs configured?">
              {costsMissing ? (
                <span className="text-warn">No — net metrics withheld</span>
              ) : (
                <span className="font-mono">{report.config.costs ?? "—"}</span>
              )}
            </KeyValueRow>
            <KeyValueRow label="Costs assumption (verbatim)">
              <span className="font-mono text-mute">
                {report.metrics === null ? "no metrics block" : report.metrics.costs_assumption ?? "—"}
              </span>
            </KeyValueRow>
            <KeyValueRow label="Train / test / walk-forward">
              <span className="text-mute">
                {[
                  report.train_metrics === null ? null : "train",
                  report.test_metrics === null ? null : "test",
                  report.walk_forward_cmp.length > 0
                    ? `${formatInt(report.walk_forward_cmp.length)} fold(s)`
                    : null,
                ]
                  .filter((x): x is string => x !== null)
                  .join(" · ") || "not produced in this run"}
              </span>
            </KeyValueRow>
            <KeyValueRow label="Signal labels seen (visible sessions)">
              {labelCounts.length === 0 ? (
                <span className="text-mute">none</span>
              ) : (
                <span className="inline-flex flex-wrap gap-2">
                  {labelCounts.map(({ label, count }) => (
                    <StatusBadge key={label} tone="mute">
                      {label.toLowerCase()} × {formatInt(count)}
                    </StatusBadge>
                  ))}
                </span>
              )}
            </KeyValueRow>
            <KeyValueRow label="Eligibility snapshot (latest session)">
              <span className="font-mono tabular">
                {formatInt(counts.eligible)} eligible · {formatInt(counts.rejected)} rejected ·{" "}
                {formatInt(counts.verifiedSpec)} with verified spec
              </span>
            </KeyValueRow>
          </dl>
        </SectionPanel>
      </div>

      {costsMissing && (
        <div className="mt-4">
          <DataNotice tone="warn" title="Costs are not configured — do not read gross numbers as performance">
            The quant boundary withholds net P&L/Sharpe whenever costs are absent. Any
            &quot;net&quot; figure appearing anywhere in this app while this notice shows would
            be a bug — report it.
          </DataNotice>
        </div>
      )}

      <div className="mt-4">
        <DataNotice tone="info" title="Where to look next">
          <div className="mt-1 flex flex-wrap gap-4">
            <Link className="inline-flex items-center gap-1.5 text-sm text-ink hover:text-gold" to="/pair">
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden /> Pair Explorer — spread history
            </Link>
            <Link className="inline-flex items-center gap-1.5 text-sm text-ink hover:text-gold" to="/signals">
              <Crosshair className="h-3.5 w-3.5" aria-hidden /> Signal Forensics — why each date acted
            </Link>
            <Link className="inline-flex items-center gap-1.5 text-sm text-ink hover:text-gold" to="/data-quality">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Data Quality — provenance &amp; rules
            </Link>
          </div>
        </DataNotice>
      </div>
    </div>
  );
}
