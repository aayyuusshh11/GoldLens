import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, Crosshair, ShieldCheck } from "lucide-react";
import type { DataQualityReportDTO, PairsResponseDTO, SignalAnalyzeDTO } from "../../types/api";
import { useApi, type Slice } from "../../app/ApiContext";
import { formatInt, formatSignedRupees, formatDateShort } from "../../lib/formatters/format";
import { PageHeader } from "../../components/layout/PageHeader";
import { SectionPanel } from "../../components/primitives/SectionPanel";
import { DataNotice } from "../../components/primitives/DataNotice";
import { LoadingState } from "../../components/states/LoadingState";
import { ErrorState } from "../../components/states/ErrorState";
import { EmptyState } from "../../components/states/EmptyState";
import {
  DecisionBadge,
  PairStatusBadge,
  ReasonCodeBadge,
  SeverityBadge,
  SufficiencyBadge,
  VerificationBadge,
} from "../../components/layout/Badges";

function KeyValueRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line/60 py-2 last:border-b-0">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/** Severity order for issue summaries (lower first). Unknown severities sort last. */
const SEVERITY_ORDER = ["critical", "error", "warning", "info"] as const;

/**
 * Slice boundary shared by every panel on this page: skeleton while the slice
 * first loads, ErrorState when it failed with nothing to show, and last-good
 * data with a labeled notice while a refresh (or a failed refresh) is in
 * flight — refreshing never blanks previously loaded data.
 */
function SliceBoundary<T>({
  slice,
  refresh,
  label,
  skeleton,
  children,
}: {
  slice: Slice<T>;
  refresh: () => void;
  label: string;
  skeleton: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (slice.data !== null) {
    return (
      <div>
        {slice.refreshing && (
          <div className="mb-3">
            <DataNotice tone="warn" title={`Refreshing ${label.toLowerCase()}…`}>
              Updating from the API — the values below are the last good data.
            </DataNotice>
          </div>
        )}
        {slice.key === "error" && slice.error !== null && (
          <div className="mb-3">
            <DataNotice tone="warn" title="Refresh failed — showing the last good data">
              <p>{slice.error.message}</p>
              <button
                type="button"
                onClick={refresh}
                className="mt-2 text-xs font-medium text-gold hover:underline"
              >
                Retry {label.toLowerCase()}
              </button>
            </DataNotice>
          </div>
        )}
        {children(slice.data)}
      </div>
    );
  }
  if (slice.key === "error" && slice.error !== null) {
    return <ErrorState error={slice.error} title={`${label} failed`} onRetry={refresh} />;
  }
  if (slice.key === "ready") {
    // Ready with no payload: stay honest instead of inventing content.
    return <EmptyState title={`${label} returned no data`} />;
  }
  return <>{skeleton}</>;
}

/** Issue counts grouped by severity, straight from the dq payload. */
function IssueSeveritySummary({ report }: { report: DataQualityReportDTO }) {
  const groups = new Map<string, { kinds: number; rows: number }>();
  for (const issue of report.issues) {
    const group = groups.get(issue.severity) ?? { kinds: 0, rows: 0 };
    groups.set(issue.severity, {
      kinds: group.kinds + 1,
      rows: group.rows + issue.count,
    });
  }
  const present = [...groups.entries()].sort(
    ([a], [b]) =>
      (SEVERITY_ORDER as readonly string[]).indexOf(a) - (SEVERITY_ORDER as readonly string[]).indexOf(b),
  );
  if (present.length === 0) {
    return <p className="text-sm text-mute">No issues reported for this dataset.</p>;
  }
  return (
    <ul className="space-y-2">
      {present.map(([severity, group]) => (
        <li key={severity} className="flex flex-wrap items-center gap-2 text-sm text-mute">
          <SeverityBadge severity={severity} />
          <span>
            {formatInt(group.kinds)} issue {group.kinds === 1 ? "kind" : "kinds"} ·{" "}
            {formatInt(group.rows)} row(s) flagged in total
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Verbatim message listed because it owns no null-hiding behavior. */
function NullFieldLine({ fields }: { fields: Array<{ name: string; value: unknown }> }) {
  const missing = fields.filter((f) => f.value === null || f.value === undefined);
  if (missing.length === 0) return null;
  return (
    <p className="text-sm text-mute">
      <span className="font-mono">{missing.map((f) => f.name).join(", ")}</span>: not computed —
      quant service not wired
    </p>
  );
}

/**
 * Overview — the landing screen that answers "what does this dataset support
 * and what does it explicitly refuse?" from the settled API slices, before
 * anyone reads a chart. Every number here comes from /api/data-quality,
 * /api/pairs or POST /api/signals/analyze; nothing is derived client-side.
 */
export function OverviewPage() {
  const {
    symbol,
    dq,
    refreshDq,
    pairs,
    refreshPairs,
    signal,
    refreshSignal,
    selectedPair,
  } = useApi();

  return (
    <div>
      <PageHeader
        kicker="Overview"
        title={`Dataset — ${symbol === "" ? "all symbols" : symbol} calendar spreads`}
        subtitle="Gates, issues and decisions below are the API's own statements. Read the refusals first: numbers only mean what their labels say."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Headline: the dataset's own history-sufficiency gates. */}
        <SectionPanel kicker="Run gates" title="History sufficiency">
          <SliceBoundary
            slice={dq}
            refresh={refreshDq}
            label="Data-quality"
            skeleton={<LoadingState label="Loading data-quality report…" rows={3} />}
          >
            {(report) => (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SufficiencyBadge
                    ok={report.history_sufficiency.sufficient_for_signal}
                    what="Signal"
                  />
                  <SufficiencyBadge
                    ok={report.history_sufficiency.sufficient_for_backtest}
                    what="Backtest"
                  />
                </div>
                <p className="text-sm text-mute">
                  Gates require ≥ {formatInt(report.history_sufficiency.minimum_required)} distinct
                  trade dates — {formatInt(report.history_sufficiency.distinct_trade_dates)} stored.
                  A refused gate means diagnostics-only output by design.
                </p>
                {report.dates_available.length === 0 ? (
                  <p className="text-sm text-mute">No trade dates recorded in this dataset.</p>
                ) : (
                  <p className="text-sm text-mute">
                    {formatInt(report.dates_available.length)} date(s) available ·{" "}
                    <span className="font-mono tabular">
                      {formatDateShort(report.dates_available[0])} →{" "}
                      {formatDateShort(report.dates_available[report.dates_available.length - 1])}
                    </span>
                  </p>
                )}
              </div>
            )}
          </SliceBoundary>
        </SectionPanel>

        <SectionPanel kicker="Pair" title="Selected pair">
          <SliceBoundary
            slice={pairs}
            refresh={refreshPairs}
            label="Pairs"
            skeleton={<LoadingState label="Loading pairs…" rows={3} />}
          >
            {(data: PairsResponseDTO) => {
              if (selectedPair === null) {
                return (
                  <DataNotice
                    tone="warn"
                    title={
                      data.pairs.length === 0
                        ? "No candidate pairs in this dataset"
                        : `No pair selected for ${symbol === "" ? "this dataset" : symbol}`
                    }
                  >
                    {data.pairs.length === 0
                      ? "Calendar-spread history is not computable until the pipeline finds overlapping expiries. Nothing is estimated in the meantime."
                      : "Choose a different symbol in the header, or wait for the pipeline to produce pairs for this one."}
                  </DataNotice>
                );
              }
              return (
                <dl>
                  <KeyValueRow label="Pair">
                    <span className="font-mono text-xs">{selectedPair.pair_id}</span>
                  </KeyValueRow>
                  <KeyValueRow label="Near → far expiry">
                    <span className="font-mono tabular">
                      {selectedPair.near.expiry_date} → {selectedPair.far.expiry_date}
                    </span>
                  </KeyValueRow>
                  <KeyValueRow label="Status">
                    <PairStatusBadge status={selectedPair.status} />
                  </KeyValueRow>
                  <KeyValueRow label="Reason codes">
                    {selectedPair.reason_codes.length === 0 ? (
                      <span className="text-mute">none returned</span>
                    ) : (
                      <span className="inline-flex flex-wrap gap-1.5">
                        {selectedPair.reason_codes.map((code) => (
                          <ReasonCodeBadge key={code} code={code} />
                        ))}
                      </span>
                    )}
                  </KeyValueRow>
                  <KeyValueRow label="Overlapping history">
                    <span className="font-mono tabular">
                      {formatInt(selectedPair.history_days)} trade date(s)
                    </span>
                  </KeyValueRow>
                </dl>
              );
            }}
          </SliceBoundary>
        </SectionPanel>

        <SectionPanel kicker="Health" title="Data quality">
          <SliceBoundary
            slice={dq}
            refresh={refreshDq}
            label="Data-quality"
            skeleton={<LoadingState label="Loading data-quality report…" rows={3} />}
          >
            {(report) => (
              <div className="space-y-3">
                <IssueSeveritySummary report={report} />
                <dl className="mt-3 border-t border-line/60 pt-2">
                  <KeyValueRow label="Contract specs — verified">
                    <span className="inline-flex items-center gap-2">
                      <VerificationBadge status="verified" />
                      <span className="font-mono tabular">
                        {formatInt(report.contract_spec_verification.verified)}
                      </span>
                    </span>
                  </KeyValueRow>
                  <KeyValueRow label="Contract specs — unverified">
                    <span className="inline-flex items-center gap-2">
                      <VerificationBadge status="unverified" />
                      <span className="font-mono tabular">
                        {formatInt(report.contract_spec_verification.unverified)}
                      </span>
                    </span>
                  </KeyValueRow>
                  <KeyValueRow label="Contract specs — conflicting">
                    <span className="inline-flex items-center gap-2">
                      <VerificationBadge status="conflicting" />
                      <span className="font-mono tabular">
                        {formatInt(report.contract_spec_verification.conflicting)}
                      </span>
                    </span>
                  </KeyValueRow>
                </dl>
              </div>
            )}
          </SliceBoundary>
        </SectionPanel>

        <SectionPanel kicker="Preview" title="Latest decision for the selected pair">
          {selectedPair === null ? (
            <p className="text-sm text-mute">
              No pair selected — the decision preview appears once pairs load.
            </p>
          ) : (
            <SliceBoundary
              slice={signal}
              refresh={refreshSignal}
              label="Signal"
              skeleton={<LoadingState label="Analyzing selected pair…" rows={3} />}
            >
              {(sig: SignalAnalyzeDTO) => (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <DecisionBadge decision={sig.decision} />
                    {sig.reason_codes.map((code) => (
                      <ReasonCodeBadge key={code} code={code} />
                    ))}
                  </div>
                  <dl>
                    <KeyValueRow label="As of date">
                      <span className="font-mono tabular">{formatDateShort(sig.as_of_date)}</span>
                    </KeyValueRow>
                    <KeyValueRow label="Spread (near − far)">
                      {sig.spread === null ? (
                        <span className="text-mute">not stated for this date</span>
                      ) : (
                        <span className="font-mono tabular">{formatSignedRupees(sig.spread)}</span>
                      )}
                    </KeyValueRow>
                    <KeyValueRow label="z-score">
                      {sig.z_score === null ? (
                        <span className="text-mute">not computed — quant service not wired</span>
                      ) : (
                        <span className="font-mono tabular">{sig.z_score}</span>
                      )}
                    </KeyValueRow>
                  </dl>
                  <NullFieldLine
                    fields={[
                      { name: "gross_edge", value: sig.gross_edge },
                      { name: "estimated_cost", value: sig.estimated_cost },
                      { name: "net_edge", value: sig.net_edge },
                    ]}
                  />
                  {sig.notes !== null && <p className="text-xs text-mute">{sig.notes}</p>}
                </div>
              )}
            </SliceBoundary>
          )}
        </SectionPanel>
      </div>

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

