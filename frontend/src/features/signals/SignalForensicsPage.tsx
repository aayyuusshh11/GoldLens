import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { BacktestReportDTO, SignalDTO } from "../../types/api";
import { formatDateShort, formatInt, formatPrice, formatRatio } from "../../lib/formatters/format";
import { PageHeader } from "../../components/layout/PageHeader";
import { SectionPanel } from "../../components/primitives/SectionPanel";
import { DataNotice } from "../../components/primitives/DataNotice";
import { ReasonList } from "../../components/primitives/ReasonList";
import { EmptyState } from "../../components/states/EmptyState";
import { SignalBadge, StatusBadge } from "../../components/layout/Badges";
import { ConfigChips } from "../../components/layout/ConfigChips";
import { ZScoreChart } from "../../components/charts/ZScoreChart";
import { SignalDecisionPanel } from "./SignalDecisionPanel";

function DetailCell({ signal }: { signal: SignalDTO }) {
  return (
    <td colSpan={6} className="bg-elevated/40 px-4 pb-4 pt-1 align-top">
      <dl className="grid gap-3 md:grid-cols-2">
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Rationale (pipeline output)</dt>
          <dd>
            <ReasonList items={[signal.rationale]} />
          </dd>
        </div>
        {signal.filter_reason !== null && signal.filter_reason !== "" && (
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-mute">Filter reason</dt>
            <dd>
              <ReasonList items={[signal.filter_reason]} />
            </dd>
          </div>
        )}
        {signal.no_trade_reason !== null && (
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-mute">No-trade reason</dt>
            <dd>
              <ReasonList items={[signal.no_trade_reason]} />
            </dd>
          </div>
        )}
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Statistics / context</dt>
          <dd className="mt-1 space-y-1 font-mono tabular text-sm text-mute">
            <p>
              position before: <span className="text-ink">{signal.position_before}</span>
            </p>
            <p>
              mean:{" "}
              <span className="text-ink">
                {signal.mean === null ? "not computed" : `${formatPrice(signal.mean)} ₹`}
              </span>{" "}
              · std:{" "}
              <span className="text-ink">
                {signal.std === null ? "not computed" : `${formatPrice(signal.std)} ₹`}
              </span>
            </p>
          </dd>
        </div>
      </dl>
    </td>
  );
}

function SignalLogTable({ signals }: { signals: SignalDTO[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (date: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <caption className="sr-only">Daily signal forensics log</caption>
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-widest text-mute">
            <th scope="col" className="py-2 pr-2 font-semibold" aria-label="Expand row" />
            <th scope="col" className="py-2 pr-3 font-semibold">Session</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Signal</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">z</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Spread (₹)</th>
            <th scope="col" className="py-2 font-semibold">Filters</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((signal) => {
            const isOpen = expanded.has(signal.trade_date);
            return (
              <Fragment key={signal.trade_date}>
                <tr className="border-b border-line/50 hover:bg-elevated/40">
                  <td className="py-2 pr-2 align-top">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={`Details for ${signal.trade_date}`}
                      onClick={() => toggle(signal.trade_date)}
                      className="rounded-md border border-line bg-elevated p-1 text-mute hover:text-ink"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                  </td>
                  <td className="py-2 pr-3 align-top font-mono tabular text-ink">
                    {formatDateShort(signal.trade_date)}
                  </td>
                  <td className="py-2 pr-3 align-top">
                    <SignalBadge signal={signal.signal} />
                  </td>
                  <td className="py-2 pr-3 text-right align-top font-mono tabular text-ink">
                    {signal.z === null ? (
                      <span className="text-mute">not computed</span>
                    ) : (
                      formatRatio(signal.z)
                    )}
                  </td>
                  <td className="py-2 pr-3 align-top text-right font-mono tabular text-ink">
                    {signal.spread === null ? (
                      <span className="text-mute">not computed</span>
                    ) : (
                      formatPrice(signal.spread)
                    )}
                  </td>
                  <td className="align-top py-2">
                    {signal.filters_ok ? (
                      <StatusBadge tone="pos">pass</StatusBadge>
                    ) : (
                      <StatusBadge tone="warn" title={signal.filter_reason ?? undefined}>
                        blocked
                      </StatusBadge>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-line/50">
                    <DetailCell signal={signal} />
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SignalForensicsPage({ report }: { report: BacktestReportDTO }) {
  if (report.signals.length === 0) {
    return (
      <div>
        <PageHeader kicker="Signal Forensics" title="No signals produced" />
        <EmptyState
          title="No signal rows in this report"
          body="The pipeline generated no daily signal output for the loaded dataset."
        />
      </div>
    );
  }

  const anyMissingZ = report.signals.some((s) => s.z === null);
  const blockedCount = report.signals.filter((s) => !s.filters_ok).length;
  /** Chart only renders when the z series is actually meaningful (SKILLS.md §8). */
  const computedZRows = report.z_score.filter((p) => p.z !== null).length;

  return (
    <div>
      <PageHeader
        kicker="Signal Forensics"
        title="Why the strategy acted or stayed out — date by date"
        subtitle="Signals, thresholds, filters and rationale exactly as produced by the quant boundary. Research output, not advice."
      />

      <SignalDecisionPanel signals={report.signals} config={report.config} />

      <div className="mt-4">
        <SectionPanel
          kicker="Strategy configuration (report.config)"
          title="Thresholds and filters applied to every decision below"
        >
          <ConfigChips report={report} />
        </SectionPanel>
      </div>

      {anyMissingZ && (
        <div className="mt-4">
          <DataNotice tone="info" title="Some sessions have no z-score">
            <ReasonList
              items={[
                `Rolling z needs at least ${report.config.min_hist_days} sessions of spread history within the ${report.config.lookback_days}-day lookback (report.config). Insufficient history renders "not computed" — never a zero z.`,
              ]}
            />
          </DataNotice>
        </div>
      )}

      {blockedCount > 0 && (
        <div className="mt-4">
          <DataNotice tone="warn" title={`${blockedCount} session(s) blocked by filters`}>
            Filter gates can veto an action even when the z threshold is crossed. Open a row
            to read the filter reason verbatim.
          </DataNotice>
        </div>
      )}

      {computedZRows >= 2 && (
        <div className="mt-4">
          <ZScoreChart points={report.z_score} config={report.config} />
        </div>
      )}

      <section className="mt-4 rounded-xl border border-line bg-surface p-4 md:p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Signal log ({formatInt(report.signals.length)} session(s))
        </h2>
        <SignalLogTable signals={report.signals} />
      </section>
    </div>
  );
}
