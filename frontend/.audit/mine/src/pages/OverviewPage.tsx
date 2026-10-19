import { Link } from "react-router-dom";
import { CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionPanel } from "@/components/primitives/SectionPanel";
import { DetailRows } from "@/components/primitives/DetailRows";
import { DataNotice } from "@/components/primitives/DataNotice";
import { StatusBadge } from "@/components/layout/Badges";
import { ReasonList } from "@/components/primitives/ReasonList";
import { EmptyState } from "@/components/primitives/EmptyState";
import { LoadingSkeleton } from "@/components/primitives/LoadingSkeleton";
import { ValidityBanner } from "@/components/report/ValidityBanner";
import { SampleNotice } from "@/components/report/SampleNotice";
import {
  grossRow,
  netRow,
  observationsSummary,
  sharpeRow,
  tradesRow,
  zStateRow,
} from "@/components/report/overviewRows";
import { parseSpecChecks } from "@/lib/report/analysis";
import { formatDate } from "@/lib/format";
import { SAMPLE_REPORT } from "@/lib/api/sample";
import type { BacktestReportDTO } from "@/lib/api/types";
import { useReport } from "@/state/ReportContext";
import { useBackendProbe } from "@/hooks/useBackendProbe";

/**
 * PHASE 4 — Overview.
 * Judges should understand GoldLens in under a minute: what it is, the state
 * of the data, the latest decision (including an explained NO TRADE), and the
 * honest backtest status. No invented values: when nothing is loaded, the page
 * says exactly that and offers an opt-in, permanently-labeled sample.
 */

function currentReport(source: ReturnType<typeof useReport>["source"]): {
  report: BacktestReportDTO | null;
  isSample: boolean;
} {
  if (source.mode === "none") return { report: null, isSample: false };
  if (source.mode === "sample") return { report: SAMPLE_REPORT, isSample: true };
  return { report: source.report, isSample: false };
}

export default function OverviewPage() {
  const { source, loadSample, clearSource, baseUrl } = useReport();
  const { state: probe, probe } = useBackendProbe();
  const { report, isSample } = currentReport(source);

  return (
    <div>
      <PageHeader
        kicker="Overview"
        title="Relative-value research for MCX gold futures"
        subtitle="GoldLens compares calendar-spread pairs across MCX gold contract expiries and explains every analytical decision — including when the correct answer is NO TRADE."
      />

      <div className="space-y-4">
        {/* Loading state (kept explicit even though current loads are local) */}
        {probe.state === "checking" ? (
          <LoadingSkeleton lines={2} label="Checking backend availability" />
        ) : null}

        {/* Connectivity statement from the probe of the proposed /api/health */}
        {probe.state === "unreachable" ? (
          <DataNotice tone="info" title="Backend not connected">
            <p>{probe.message}</p>
            <p className="mt-1">
              Proposed route probed: <code className="data-font text-xs">GET {baseUrl}/api/health</code>.
              All contract routes remain PROPOSED (docs/API_CONTRACT.md §1) — nothing is invented here.
            </p>
          </DataNotice>
        ) : null}
        {probe.state === "reachable" ? (
          <DataNotice tone="info" title="Backend answered — contract still unconfirmed">
            <p>
              A route responded on <code className="data-font text-xs">{baseUrl}/api/health</code>.
              Endpoint paths and response shapes remain proposed until the backend owner
              confirms the contract; no data is asserted beyond this liveness result.
            </p>
          </DataNotice>
        ) : null}

        {isSample ? (
          <SampleNotice onClose={clearSource} />
        ) : null}

        {report ? (
          <>
            <ValidityBanner report={report} />

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Data status — from data_provenance only */}
              <SectionPanel kicker="Data status" title="Source coverage">
                <DetailRows
                  rows={[
                    ["Distinct trading days", formatInt(report.data_provenance.trading_days)],
                    [
                      "Session range",
                      report.data_provenance.date_range
                        .map((d) => formatDate(d))
                        .join(" – "),
                    ],
                    [
                      "Spec cross-checks",
                      report.data_provenance.spec_checks?.length
                        ? `${report.data_provenance.spec_checks.length} reported`
                        : "None reported",
                    ],
                    ["Spread observations", observationsSummary(report)],
                  ]}
                />
                {parseSpecChecks(report.data_provenance.spec_checks).length > 0 ? (
                  <ul className="mt-3 space-y-1 text-xs text-mute">
                    {parseSpecChecks(report.data_provenance.spec_checks).map((check, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <StatusBadge tone={check.ok && !check.unparsed ? "pos" : "neg"}>
                          {check.unparsed ? "unparsed" : check.ok ? "pass" : "fail"}
                        </StatusBadge>
                        <span className="min-w-0 data-font break-words">{check.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-mute">
                    No specification cross-checks reported — absence of checks is not
                    evidence of a clean dataset.
                  </p>
                )}
              </SectionPanel>

              {/* Latest analysis status — from signals + z_score */}
              <SectionPanel
                kicker="Latest analysis"
                title="Current decision"
                aside={
                  <StatusBadge tone={report.signals.at(-1)?.signal === "NO TRADE" ? "neutral" : "info"}>
                    {report.signals.at(-1)?.signal ?? "No signal"}
                  </StatusBadge>
                }
              >
                <DetailRows
                  rows={[
                    ["Pair", report.pair.symbol],
                    ["Near / far expiry", `${report.pair.near_expiry} / ${report.pair.far_expiry}`],
                    ["Trade date", formatDate(report.signals.at(-1)?.trade_date ?? null)],
                    ["Z-score", zStateRow(report)],
                    ["NO TRADE reason", report.signals.at(-1)?.no_trade_reason ?? "—"],
                  ]}
                />
                {report.signals.length > 0 ? (
                  <div className="mt-3">
                    <p className="kicker">Backend rationale (verbatim)</p>
                    <ReasonList items={[report.signals.at(-1)!.rationale]} />
                  </div>
                ) : null}
              </SectionPanel>
            </div>

            {/* Backtest status — metrics only as supplied */}
            <SectionPanel
              kicker="Backtest status"
              title="Run record"
              aside={<StatusBadge tone={report.is_valid_backtest ? "pos" : "neg"}>{validBadgeLabel(report)}</StatusBadge>}
              className="lg:grid lg:grid-cols-2 lg:gap-x-8"
            >
              <DetailRows
                rows={[
                  ["Spread observations", observationsSummary(report)],
                  ["Trades", tradesRow(report)],
                  ["Gross P&L", grossRow(report)],
                  ["Net P&L", netRow(report)],
                  ["Sharpe", sharpeRow(report)],
                  ["Costs assumption", report.metrics?.costs_assumption ?? "Not available"],
                ]}
              />
              <div className="mt-3 lg:mt-0">
                {report.metrics && report.metrics.notes.length > 0 ? (
                  <>
                    <p className="kicker mb-1">Backend notes (verbatim)</p>
                    <ReasonList items={report.metrics.notes} />
                  </>
                ) : null}
              </div>
            </SectionPanel>

            {/* Dataset too short → hard-to-miss warning */}
            {report.data_provenance.trading_days < 30 ? (
              <DataNotice tone="critical" title="Dataset too short for a valid backtest">
                <p>
                  {formatInt(report.data_provenance.trading_days)} trading day(s) available —
                  the validity gate needs at least 30 spread observations. Any performance
                  framing of this run is invalid; treat outputs as diagnostics.
                </p>
              </DataNotice>
            ) : null}
          </>
        ) : (
          <EmptyState
            title={source.mode === "none" ? "No report loaded" : "Report unavailable"}
            action={
              source.mode === "none" ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={probe}
                    className="min-h-9 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-elevated"
                  >
                    Probe backend (proposed /api/health)
                  </button>
                  <button
                    type="button"
                    onClick={loadSample}
                    className="min-h-9 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-elevated"
                  >
                    Load sample report (labeled demo data)
                  </button>
                </div>
              ) : undefined
            }
          >
            {source.mode === "none"
              ? "Until the GoldLens backend exists, the Overview shows real provenance and analysis state only — either adopted live from a confirmed endpoint, or from the supplied one-day sample, permanently labeled as such."
              : "The selected source could not be read."}
          </EmptyState>
        )}

        {/* Fixed guidance + honest framing (not fabricated KPIs) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionPanel kicker="Honesty" title="What GoldLens is, and is not">
            <ul className="list-inside list-disc space-y-1.5 text-sm max-w-prose">
              <li>Historical MCX bhavcopy research — not a live feed, not investment advice.</li>
              <li>
                Signals and metrics come from the quant boundary; the interface never
                recomputes them, fills gaps, or converts spread points into invented rupee P&L.
              </li>
              <li>
                A NO TRADE with a stated reason (e.g. insufficient rolling history) is a
                legitimate result — not an error, and not a missed profit claim.
              </li>
            </ul>
            <p className="mt-3 flex items-start gap-2 text-xs text-mute">
              <CircleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
              Demo previews are opt-in and permanently labeled “Sample report — not live data”.
            </p>
          </SectionPanel>

          <SectionPanel kicker="Guidance" title="Research areas">
            <ul className="space-y-1 text-sm">
              {(
                [
                  ["/pair-explorer", "Pair Explorer", "How has this pair behaved over time?"],
                  ["/signal-forensics", "Signal Forensics", "Why is this signal present, weak, or absent?"],
                  ["/backtest", "Backtest", "Did the strategy hold up out of sample after costs?"],
                  ["/data-quality", "Data Quality", "Can these inputs be trusted?"],
                ] as const
              ).map(([to, label, purpose]) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="group flex min-h-11 flex-col justify-center rounded-md px-3 -mx-3 hover:bg-elevated"
                  >
                    <span className="font-medium text-ink underline-offset-2 group-hover:underline">
                      {label}
                    </span>
                    <span className="text-mute">{purpose}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}

/** One-line validity label for the badge row (verbatim, no paraphrasing). */
function validBadgeLabel(report: BacktestReportDTO): string {
  return report.is_valid_backtest ? "Valid backtest" : "Not a valid backtest";
}
