import type { ReactNode } from "react";
import type { DataQualityReportDTO } from "../../types/api";
import { useApi, type Slice } from "../../app/ApiContext";
import { formatInt } from "../../lib/formatters/format";
import { PageHeader } from "../../components/layout/PageHeader";
import { SectionPanel } from "../../components/primitives/SectionPanel";
import {
  SeverityBadge,
  StatusBadge,
  SufficiencyBadge,
  VerificationBadge,
} from "../../components/layout/Badges";
import { LoadingState } from "../../components/states/LoadingState";
import { ErrorState } from "../../components/states/ErrorState";
import { EmptyState } from "../../components/states/EmptyState";
import { MethodologyNotes } from "./MethodologyNotes";

function KeyValueRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line/60 py-2 last:border-b-0">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/**
 * The dq slice is the page's whole data source: skeleton while it first loads,
 * ErrorState (with a retry) when it failed with nothing to show, and last-good
 * data under a labeled notice while a refresh is (or was) in flight.
 */
function DqBoundary({
  slice,
  refresh,
  children,
}: {
  slice: Slice<DataQualityReportDTO>;
  refresh: () => void;
  children: (report: DataQualityReportDTO) => ReactNode;
}) {
  if (slice.data !== null) {
    return (
      <div>
        {slice.refreshing && (
          <div className="mb-3">
            <p role="status" className="text-xs font-medium text-warn">
              Refreshing the report… the values below are the last good data.
            </p>
          </div>
        )}
        {slice.key === "error" && slice.error !== null && (
          <div className="mb-3">
            <p role="alert" className="text-xs text-neg">
              Refresh failed: {slice.error.message} — showing the last good data.{" "}
              <button type="button" onClick={refresh} className="font-medium text-gold hover:underline">
                Retry
              </button>
            </p>
          </div>
        )}
        {children(slice.data)}
      </div>
    );
  }
  if (slice.key === "error" && slice.error !== null) {
    return <ErrorState error={slice.error} title="Data-quality report failed" onRetry={refresh} />;
  }
  if (slice.key === "ready") {
    return <EmptyState title="Data-quality report returned no data" />;
  }
  return <LoadingState label="Loading data-quality report…" rows={6} wide />;
}

/** dates_available: full list while small, honest first/last + count when long. */
function DatesAvailable({ dates }: { dates: string[] }) {
  if (dates.length === 0) {
    return <p className="text-sm text-mute">No trade dates recorded for this ingest.</p>;
  }
  const first = dates[0] ?? "";
  const last = dates[dates.length - 1] ?? "";
  return (
    <div>
      <p className="text-xs text-mute">
        {formatInt(dates.length)} trade date(s) available —{" "}
        <span className="font-mono tabular">
          {first} → {last}
        </span>
      </p>
      {dates.length <= 12 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {dates.map((date) => (
            <li key={date}>
              <span className="rounded border border-line bg-elevated px-2 py-0.5 font-mono text-[11px] text-mute">
                {date}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Data Quality — the ingest's own accounting from GET /api/data-quality: row
 * counts, per-file sources, issue codes with verbatim messages, contract-spec
 * verification and the history-sufficiency gates. Nothing is derived or
 * re-summarized beyond collapsing repeated counts; messages render verbatim.
 */
export function DataQualityPage() {
  const { dq, refreshDq } = useApi();

  return (
    <div>
      <PageHeader
        kicker="Data Quality"
        title="Ingest provenance, issues and sufficiency"
        subtitle="Row accounting, source files and the pipeline's own issue messages from GET /api/data-quality. Zero-count rows stay listed — a zero is a fact, not an omission."
      />

      <DqBoundary slice={dq} refresh={refreshDq}>
        {(report) => (
          <div className="space-y-4">
            {/* Sources: file-level accounting straight from the report. */}
            <SectionPanel
              kicker="Provenance"
              title="Ingested sources"
              caption={`Generated ${report.generated_at}. File paths and timestamps come verbatim from the ingest report.`}
            >
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <caption className="sr-only">Ingested source files and their row accounting</caption>
                  <thead className="bg-elevated">
                    <tr className="text-[11px] uppercase tracking-widest text-mute">
                      <th scope="col" className="px-3 py-2 font-semibold">File</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Ingested</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Input rows</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Accepted / rejected</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Inserted / skipped</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sources.map((source) => (
                      <tr key={source.file} className="border-t border-line/40">
                        <td className="px-3 py-2 font-mono text-xs text-ink">{source.file}</td>
                        <td className="px-3 py-2 font-mono text-xs tabular text-mute">{source.ingested_at}</td>
                        <td className="px-3 py-2 text-right font-mono tabular text-ink">
                          {formatInt(source.input_rows)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular text-ink">
                          {formatInt(source.accepted_rows)} / {formatInt(source.rejected_rows)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular text-ink">
                          {formatInt(source.observations_inserted)} / {formatInt(source.observations_skipped)}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge tone="mute">{source.status}</StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionPanel>

            {/* Row totals grid. */}
            <SectionPanel kicker="Rows" title="Row accounting">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {(
                  [
                    ["Total", report.rows.total],
                    ["FUTCOM", report.rows.futcom_rows],
                    ["Options", report.rows.options_rows],
                    ["FUTIDX", report.rows.futidx_rows],
                    ["Rejected", report.rows.rejected_rows],
                  ] as Array<[string, number]>
                ).map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-line bg-elevated px-3 py-2">
                    <dt className="text-[11px] uppercase tracking-widest text-mute">{label}</dt>
                    <dd className="font-mono tabular text-base text-ink">{formatInt(value)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-mute">
                Rejected rows are counted, never silently dropped; unsupported instrument rows
                (options/index) are excluded from analytics and still accounted for in the
                issue list below.
              </p>
            </SectionPanel>

            {/* Issues: severity + code + count + verbatim message. */}
            <SectionPanel kicker="Issues" title="Issue list">
              {report.issues.length === 0 ? (
                <EmptyState title="No issues reported for this dataset" />
              ) : (
                <ul className="space-y-3">
                  {report.issues.map((issue) => (
                    <li
                      key={issue.code}
                      className="border-b border-line/60 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={issue.severity} />
                        <span className="font-mono text-xs text-ink">{issue.code}</span>
                        <span className="font-mono tabular text-xs text-mute">
                          × {formatInt(issue.count)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-mute">{issue.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionPanel>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Contract spec verification counts. */}
              <SectionPanel kicker="Verification" title="Contract spec verification">
                <dl>
                  <KeyValueRow label="Verified with a source">
                    <span className="inline-flex items-center gap-2">
                      <VerificationBadge status="verified" />
                      <span className="font-mono tabular">{formatInt(report.contract_spec_verification.verified)}</span>
                    </span>
                  </KeyValueRow>
                  <KeyValueRow label="Unverified (specs stay null)">
                    <span className="inline-flex items-center gap-2">
                      <VerificationBadge status="unverified" />
                      <span className="font-mono tabular">{formatInt(report.contract_spec_verification.unverified)}</span>
                    </span>
                  </KeyValueRow>
                  <KeyValueRow label="Conflicting sources">
                    <span className="inline-flex items-center gap-2">
                      <VerificationBadge status="conflicting" />
                      <span className="font-mono tabular">{formatInt(report.contract_spec_verification.conflicting)}</span>
                    </span>
                  </KeyValueRow>
                </dl>
              </SectionPanel>

              {/* History sufficiency gates with the minimum shown next to the count. */}
              <SectionPanel kicker="Run gates" title="History sufficiency">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <SufficiencyBadge ok={report.history_sufficiency.sufficient_for_signal} what="Signal" />
                  <SufficiencyBadge ok={report.history_sufficiency.sufficient_for_backtest} what="Backtest" />
                </div>
                <dl>
                  <KeyValueRow label="Distinct trade dates / minimum required">
                    <span className="font-mono tabular">
                      {formatInt(report.history_sufficiency.distinct_trade_dates)} of ≥{" "}
                      {formatInt(report.history_sufficiency.minimum_required)}
                    </span>
                  </KeyValueRow>
                </dl>
                <DatesAvailable dates={report.dates_available} />
              </SectionPanel>
            </div>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-ink">Methodology reference</h2>
              <MethodologyNotes />
            </section>
          </div>
        )}
      </DqBoundary>
    </div>
  );
}
