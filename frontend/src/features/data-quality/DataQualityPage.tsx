import { useEffect, useState } from "react";
import type { BacktestReportDTO } from "../../types/api";
import { useReport } from "../../app/ReportContext";
import { appConfig } from "../../lib/api/config";
import { HttpClient, buildQuery } from "../../lib/api/client";
import { ApiRequestError, describeError } from "../../lib/api/errors";
import { VALIDITY_GATE_MIN_OBSERVATIONS, countStale, dateRangeLabel, gapDaysCount, netWithheldReason, parseSpecChecks } from "../../lib/reportAnalysis";
import { formatDateShort, formatInt } from "../../lib/formatters/format";
import { PageHeader } from "../../components/layout/PageHeader";
import { SectionPanel } from "../../components/primitives/SectionPanel";
import { DataNotice } from "../../components/primitives/DataNotice";
import { ReasonList } from "../../components/primitives/ReasonList";
import { StatusBadge } from "../../components/layout/Badges";
import { MethodologyNotes } from "./MethodologyNotes";

const REQUIRED_FRAME_COLUMNS = [
  "trade_date",
  "symbol",
  "instrument",
  "expiry_ts",
  "close",
  "volume_lots",
  "open_interest_lots",
  "value_lakhs",
] as const;

/**
 * Proposed GET /api/v1/data-quality probe. The route is pending in the
 * contract draft; any failure degrades into a transparent notice and the page
 * falls back to provenance facts the loaded report already carries — which
 * keeps the page useful both before and after the backend ships the route.
 */
function useDataQualityProbe(baseUrl: string | null): {
  state: "fixture" | "checking" | "loaded" | "pending" | "error";
  sources?: unknown;
  error?: string;
} {
  const [state, setState] = useState<{ state: "fixture" | "checking" | "loaded" | "pending" | "error"; sources?: unknown; error?: string }>({
    state: baseUrl === null ? "fixture" : "checking",
  });

  useEffect(() => {
    if (baseUrl === null) return;
    let cancelled = false;
    const client = new HttpClient(baseUrl);
    client
      .getJson<unknown>(`/data-quality${buildQuery({})}`, (raw) => raw)
      .then((sources) => {
        if (!cancelled) setState({ state: "loaded", sources });
      })
      .catch((error) => {
        if (cancelled) return;
        const appError = ApiRequestError instanceof Object && error instanceof ApiRequestError ? error : describeError(error);
        setState({
          state: "pending",
          error: appError.message,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  return state;
}

function SpecCheckList({ specChecks }: { specChecks: string[] }) {
  const parsed = parseSpecChecks(specChecks);
  if (parsed.length === 0) {
    return <p className="text-sm text-mute">No specification cross-checks reported for this dataset.</p>;
  }
  return (
    <ul className="space-y-2">
      {parsed.map((check) => (
        <li key={`${check.ok}-${check.text.slice(0, 24)}`} className="flex items-start gap-2 text-sm">
          <StatusBadge tone={check.ok ? "pos" : "neg"}>{check.ok ? "pass" : "fail"}</StatusBadge>
          <span className="min-w-0 font-mono text-xs text-mute">{check.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function DataQualityPage({ report }: { report: BacktestReportDTO }) {
  const { source } = useReport();
  const probe = useDataQualityProbe(source.mode === "live" ? source.config.baseUrl : null);
  const staleCount = countStale(report.spread_observations);
  const gaps = gapDaysCount(
    report.spread_observations.map((o) => o.trade_date),
  );
  const withheld = netWithheldReason(report, report.metrics);

  return (
    <div>
      <PageHeader
        kicker="Data Quality"
        title="Provenance, validity rules and methodology"
        subtitle="Where the data came from, what the pipeline verified, and what still needs the quant owner's confirmation."
      />

      {probe.state === "pending" && (
        <div className="mb-4">
          <DataNotice tone="info" title="GET /api/v1/data-quality is not implemented yet">
            <p>
              The endpoint is proposed in docs/API_CONTRACT.md but the backend has not
              shipped it ({probe.error !== undefined ? `probe error: ${probe.error}` : "route missing"}).
              Everything below is derived from provenance fields in the loaded report.
            </p>
          </DataNotice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionPanel kicker="Provenance" title="Source coverage (from report payload)">
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-mute">Session range</dt>
              <dd className="font-mono tabular text-ink">{dateRangeLabel(report.data_provenance.date_range)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-mute">Distinct trading days</dt>
              <dd className="font-mono tabular text-ink">{formatInt(report.data_provenance.trading_days)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-mute">Spread observations</dt>
              <dd className="font-mono tabular text-ink">{formatInt(report.spread_observations.length)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-mute">Validity gate</dt>
              <dd className="text-ink">
                {report.is_valid_backtest ? "passed" : `failed (≥ ${VALIDITY_GATE_MIN_OBSERVATIONS} observations required)`}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-mute">
            Source paths are carried by the backend dataset loader; they appear in the
            /data-quality route once implemented. The report itself exposes coverage
            only — the UI does not guess file paths.
          </p>
        </SectionPanel>

        <SectionPanel kicker="Pipeline checks" title="Specification cross-checks">
          <SpecCheckList specChecks={report.data_provenance.spec_checks} />
        </SectionPanel>

        <SectionPanel kicker="Data rules" title="Quality observations for this run">
          <ReasonList
            items={[
              `${formatInt(staleCount)} observation(s) flagged stale by the pipeline (leg prices not trusted on those dates).`,
              gaps > 0
                ? `${formatInt(gaps)} calendar gap(s) > 1 day between plotted sessions (weekends/holidays) — points are not interpolated across them.`
                : "No calendar gaps beyond weekends in the plotted range.",
              "Null z / mean / std remain null in tables and charts (rendered 'not computed').",
              "Rejections are reported in pair.rejections counts rather than being dropped silently.",
            ]}
          />
          {withheld !== null && (
            <div className="mt-3">
              <DataNotice tone="warn" title="Costs governance">
                {withheld}
              </DataNotice>
            </div>
          )}
        </SectionPanel>

        <SectionPanel kicker="Contract" title="Columns validated by the quant boundary">
          <p className="text-xs text-mute">
            The boundary's validate_bhavcopy_frame rejects frames missing any of
            (docs/DATA_SCHEMA.md):
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {REQUIRED_FRAME_COLUMNS.map((column) => (
              <li key={column}>
                <span className="rounded border border-line bg-elevated px-2 py-1 font-mono text-[11px] text-mute">
                  {column}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-mute">
            All-zero trading volume or unparsable dates cause a data_quality_rejected
            error — the app renders that as an explicit error state, not empty content.
          </p>
        </SectionPanel>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">Methodology reference</h2>
        <MethodologyNotes />
      </section>
    </div>
  );
}

export { formatDateShort as _dqDateFmt };
