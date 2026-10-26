import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useApi, type Slice } from "../../app/ApiContext";
import type { PairHistoryDTO, PairSummaryDTO, WarningItemDTO } from "../../types/api";
import { formatDateShort, formatInt, formatSignedRupees } from "../../lib/formatters/format";
import { PageHeader } from "../../components/layout/PageHeader";
import { SectionPanel } from "../../components/primitives/SectionPanel";
import { DataNotice } from "../../components/primitives/DataNotice";
import { LoadingState } from "../../components/states/LoadingState";
import { ErrorState } from "../../components/states/ErrorState";
import { EmptyState } from "../../components/states/EmptyState";
import {
  PairStatusBadge,
  ReasonCodeBadge,
} from "../../components/layout/Badges";
import { SpreadChart } from "../../components/charts/SpreadChart";

/**
 * Pair Explorer — the spread-history screen over the settled 7-route API.
 * GET /api/pairs feeds the picker; GET /api/pairs/{pair_id}/history feeds the
 * chart, the presentation-only stats band and the verbatim warnings. No
 * z-series and no per-trade list exist in the settled contract, so none are
 * shown. "reference_only" rows are labeled — honest refusals are the product.
 */

/** Slice boundary: skeleton on first load, error state without data, and
 * last-good data (labeled) while refreshing. Mirrors the pattern other
 * feature pages use so slice behavior stays consistent app-wide. */
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
  return <>{skeleton}</>;
}

function RefreshButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 py-1 text-xs font-medium text-ink hover:border-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RotateCcw className="h-3 w-3" aria-hidden />
      {label}
    </button>
  );
}

/** Pair picker: one button per candidate pair of the selected symbol. */
function PairPickerButton({
  pair,
  selected,
  onSelect,
}: {
  pair: PairSummaryDTO;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        selected ? "border-gold/70 bg-gold/10" : "border-line bg-elevated hover:border-gold/40"
      }`}
    >
      <span className="flex w-full flex-wrap items-center justify-between gap-2">
        <span className="break-all font-mono text-xs text-ink">{pair.pair_id}</span>
        <PairStatusBadge status={pair.status} />
      </span>
      <span className="font-mono text-xs text-mute">
        {formatDateShort(pair.near.expiry_date)} → {formatDateShort(pair.far.expiry_date)}
      </span>
      <span className="text-[11px] text-mute">
        {formatInt(pair.history_days)} overlapping trade date(s)
      </span>
    </button>
  );
}

/** Warnings render verbatim, one notice per item, severity-mapped. */
function HistoryWarnings({ warnings }: { warnings: WarningItemDTO[] }) {
  if (warnings.length === 0) {
    return <p className="text-sm text-mute">No warnings returned with this history response.</p>;
  }
  return (
    <ul className="space-y-2">
      {warnings.map((warning) => (
        <li key={`${warning.code}-${warning.message}`}>
          <DataNotice tone={warning.severity === "error" || warning.severity === "critical" ? "danger" : "warn"} title={`${warning.code} — ${warning.message}`}>
            <p>
              severity: <span className="font-mono">{warning.severity}</span> · count:{" "}
              <span className="font-mono tabular">{formatInt(warning.count)}</span>
            </p>
          </DataNotice>
        </li>
      ))}
    </ul>
  );
}

/** Presentation math on the returned rows only — never a "tradable history" claim. */
function StatsBand({ observations }: { observations: PairHistoryDTO["observations"] }) {
  const spreads = observations
    .map((o) => o.spread)
    .filter((s): s is number => s !== null);
  const referenceOnly = observations.filter((o) => o.status === "reference_only").length;
  const min = spreads.length === 0 ? null : Math.min(...spreads);
  const max = spreads.length === 0 ? null : Math.max(...spreads);

  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Rows</dt>
          <dd className="font-mono text-sm font-medium tabular text-ink">
            {formatInt(observations.length)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Min spread (₹)</dt>
          <dd className="font-mono text-sm font-medium tabular text-ink">
            {min === null ? <span className="text-mute">— none computed</span> : formatSignedRupees(min)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Max spread (₹)</dt>
          <dd className="font-mono text-sm font-medium tabular text-ink">
            {max === null ? <span className="text-mute">— none computed</span> : formatSignedRupees(max)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">reference_only rows</dt>
          <dd className="font-mono text-sm font-medium tabular text-ink">
            {formatInt(referenceOnly)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-mute">
        Presentation math over the returned rows only — this is not an analytics output and
        never claims a tradable history; eligibility is backend&apos;s call, not the UI&apos;s.
      </p>
    </div>
  );
}

export function PairExplorerPage() {
  const {
    symbol,
    pairs,
    refreshPairs,
    pairsForSymbol,
    pairId,
    setPairId,
    selectedPair,
    history,
    refreshHistory,
  } = useApi();

  return (
    <div>
      <PageHeader
        kicker="Pair Explorer"
        title={
          selectedPair === null
            ? `Calendar-spread pairs — ${symbol === "" ? "all symbols" : symbol}`
            : `${symbol} — ${formatDateShort(selectedPair.near.expiry_date)} vs ${formatDateShort(selectedPair.far.expiry_date)}`
        }
        subtitle="Pick a near/far expiry pair, then read the raw spread history. reference_only sessions are shown but never counted as tradable history."
        actions={
          selectedPair !== null && (
            <PairStatusBadge status={selectedPair.status} />
          )
        }
      />

      {/* Pair picker (GET /api/pairs, filtered by the selected symbol client-side). */}
      <SectionPanel
        kicker="Pairs"
        title={`Candidate pairs for ${symbol === "" ? "this dataset" : symbol}`}
        actions={<RefreshButton onClick={refreshPairs} label="Refresh pairs" />}
      >
        <SliceBoundary
          slice={pairs}
          refresh={refreshPairs}
          label="Pairs"
          skeleton={<LoadingState label="Loading pairs…" rows={3} />}
        >
          {() => {
            if (pairsForSymbol.length === 0) {
              return (
                <EmptyState
                  title="No candidate pairs for this symbol"
                  body="The pipeline found no adjacent expiries with overlapping observation dates yet. Nothing is estimated in the meantime."
                />
              );
            }
            return (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pairsForSymbol.map((pair) => (
                  <PairPickerButton
                    key={pair.pair_id}
                    pair={pair}
                    selected={pair.pair_id === pairId}
                    onSelect={() => setPairId(pair.pair_id)}
                  />
                ))}
              </div>
            );
          }}
        </SliceBoundary>
      </SectionPanel>

      {/* Selected pair summary. */}
      <SectionPanel
        className="mt-4"
        kicker="Selected pair"
        title={selectedPair === null ? "No pair selected" : selectedPair.pair_id}
        caption="Statuses come from GET /api/pairs as-is: candidate_only means specs unverified and/or thresholds unmet — eligibility is the backend's."
      >
        {selectedPair === null ? (
          <EmptyState
            title="No pair selected"
            body="Pick a pair above — its spread history and diagnostics render here."
          />
        ) : (
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] uppercase tracking-widest text-mute">Near leg</dt>
              <dd className="font-mono text-sm tabular text-ink">
                {selectedPair.near.contract_id} · expires {selectedPair.near.expiry_date}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-widest text-mute">Far leg</dt>
              <dd className="font-mono text-sm tabular text-ink">
                {selectedPair.far.contract_id} · expires {selectedPair.far.expiry_date}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-widest text-mute">Pair status</dt>
              <dd className="mt-1">
                <PairStatusBadge status={selectedPair.status} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-widest text-mute">Reason codes</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {selectedPair.reason_codes.map((code) => (
                  <ReasonCodeBadge key={code} code={code} />
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-widest text-mute">History days</dt>
              <dd className="font-mono text-sm tabular text-ink">
                {formatInt(selectedPair.history_days)}
              </dd>
            </div>
          </dl>
        )}
      </SectionPanel>

      {/* Spread history for the selected pair. */}
      <SectionPanel
        className="mt-4"
        kicker="Spread history"
        title={
          selectedPair === null
            ? "Spread history"
            : `Near ${formatDateShort(selectedPair.near.expiry_date)} vs far ${formatDateShort(selectedPair.far.expiry_date)}`
        }
        actions={
          selectedPair !== null && (
            <RefreshButton
              onClick={refreshHistory}
              label="Refresh history"
              disabled={history.refreshing}
            />
          )
        }
      >
        {selectedPair === null ? (
          <p className="text-sm text-mute">Select a pair to load its spread history.</p>
        ) : (
          <SliceBoundary
            slice={history}
            refresh={refreshHistory}
            label="History"
            skeleton={<LoadingState label="Loading spread history…" rows={4} wide />}
          >
            {(data) => {
              if (data.observations.length === 0) {
                return (
                  <EmptyState
                    title="No observations for this pair"
                    body="The history route returned an empty observations list for these expiries — there is nothing to plot, and nothing is invented."
                  />
                );
              }
              return (
                <div className="space-y-4">
                  <StatsBand observations={data.observations} />
                  {data.warnings.length > 0 && <HistoryWarnings warnings={data.warnings} />}
                  <SpreadChart observations={data.observations} />
                </div>
              );
            }}
          </SliceBoundary>
        )}
      </SectionPanel>
    </div>
  );
}
