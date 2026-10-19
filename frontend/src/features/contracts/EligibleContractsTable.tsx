import type { BacktestReportDTO } from "../../types/api";
import { formatInt } from "../../lib/formatters/format";
import { EmptyState } from "../../components/states/EmptyState";
import { StatusBadge } from "../../components/layout/Badges";

export type SortKey = "eligible" | "symbol" | "expiry" | "dte" | "close" | "volume" | "oi" | "value";

type SortValues = Record<SortKey, number | string>;

function sortValuesOf(c: BacktestReportDTO["eligible_contracts"][number]): SortValues {
  return {
    eligible: c.eligible ? 1 : 0,
    symbol: c.symbol,
    expiry: c.expiry ?? "",
    dte: c.days_to_expiry ?? Number.POSITIVE_INFINITY,
    close: c.close ?? Number.NEGATIVE_INFINITY,
    volume: c.volume_lots ?? Number.NEGATIVE_INFINITY,
    oi: c.open_interest_lots ?? Number.NEGATIVE_INFINITY,
    value: c.value_lakhs ?? Number.NEGATIVE_INFINITY,
  };
}

const DEFAULT_VISIBLE = 40;

/** Module-level so React keeps the header DOM stable across sort re-renders. */
function SortHeader({
  label,
  k,
  sort,
  onToggleSort,
  numeric,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onToggleSort: (key: SortKey) => void;
  numeric?: boolean;
}) {
  const isActive = sort.key === k;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`py-2 pr-3 font-semibold ${numeric === true ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={() => onToggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-gold ${isActive ? "text-gold" : ""}`}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <span aria-hidden>{isActive ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

/**
 * Eligible contracts table: search + filters + column sort + performance-guard
 * pagination. Every rejected contract stays visible by default; the
 * eligible-only filter is an explicit user action (SKILLS.md forbids hiding
 * rejections silently). Null spec ⇒ "not verified" (never inferred).
 *
 * Controlled component: state lives in EligibleContractsPage so the page can
 * manage the `Show all` budget and counts.
 */
export function EligibleContractsTable({
  contracts,
  search,
  eligibleOnly,
  verifiedOnly,
  sort,
  visibleCount = DEFAULT_VISIBLE,
  onToggleSort,
  onShowAll,
  onSearch,
  onToggleEligibleOnly,
  onToggleVerifiedOnly,
}: {
  contracts: BacktestReportDTO["eligible_contracts"];
  search: string;
  eligibleOnly: boolean;
  verifiedOnly: boolean;
  sort: { key: SortKey; dir: "asc" | "desc" };
  visibleCount?: number;
  onToggleSort: (key: SortKey) => void;
  onShowAll: () => void;
  onSearch: (value: string) => void;
  onToggleEligibleOnly: () => void;
  onToggleVerifiedOnly: () => void;
}) {
  const needle = search.trim().toLowerCase();
  const filtered = contracts
    .filter((c) => needle === "" || c.symbol.toLowerCase().includes(needle) || (c.reason ?? "").toLowerCase().includes(needle))
    .filter((c) => !eligibleOnly || c.eligible)
    .filter((c) => !verifiedOnly || (c.lot_size_g !== null && c.quote_basis_g !== null));

  const sorted = [...filtered].sort((a, b) => {
    const av = sortValuesOf(a)[sort.key];
    const bv = sortValuesOf(b)[sort.key];
    const cmp =
      typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv)
        : (av as number) - (bv as number);
    return sort.dir === "asc" ? cmp : -cmp;
  });

  const visible = sorted.slice(0, visibleCount);
  const hidden = sorted.length - visible.length;
  const rejectedShown = visible.filter((c) => !c.eligible).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2">
          <span className="sr-only">Search symbol or reason</span>
          <input
            type="search"
            value={search}
            placeholder="Search symbol or reason…"
            onChange={(e) => onSearch(e.target.value)}
            className="w-56 rounded-lg border border-line bg-elevated px-3 py-1.5 text-sm text-ink placeholder:text-mute/60 hover:border-mute/60"
          />
        </label>

        <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-mute">
          <input type="checkbox" checked={eligibleOnly} onChange={onToggleEligibleOnly} className="accent-[#C7A45B]" />
          Eligible only
        </label>
        <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-mute">
          <input type="checkbox" checked={verifiedOnly} onChange={onToggleVerifiedOnly} className="accent-[#C7A45B]" />
          Verified spec only
        </label>

        <p aria-live="polite" className="ml-auto text-xs text-mute">
          Showing {formatInt(visible.length)} of {formatInt(sorted.length)} filtered contracts ·{" "}
          {formatInt(visible.length - rejectedShown)} eligible · {formatInt(rejectedShown)} rejected in view
        </p>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="No contracts match the current filters" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line" style={{ maxHeight: "28rem" }}>
          <table className="w-full min-w-[900px] text-left text-sm">
            <caption className="sr-only">Eligible contracts snapshot for the latest session</caption>
            <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_0_#2A313A]">
              <tr className="text-[11px] uppercase tracking-widest text-mute">
                <SortHeader label="Status" k="eligible" sort={sort} onToggleSort={onToggleSort} />
                <SortHeader label="Symbol" k="symbol" sort={sort} onToggleSort={onToggleSort} />
                <SortHeader label="Expiry" k="expiry" sort={sort} onToggleSort={onToggleSort} />
                <SortHeader label="DTE" k="dte" numeric sort={sort} onToggleSort={onToggleSort} />
                <SortHeader label="Close (₹)" k="close" numeric sort={sort} onToggleSort={onToggleSort} />
                <SortHeader label="Volume (lots)" k="volume" numeric sort={sort} onToggleSort={onToggleSort} />
                <SortHeader label="OI (lots)" k="oi" numeric sort={sort} onToggleSort={onToggleSort} />
                <SortHeader label="Value (₹ lakh)" k="value" numeric sort={sort} onToggleSort={onToggleSort} />
                <th scope="col" className="py-2 pr-3 font-semibold">Filter reason</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Spec</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c, index) => (
                <tr
                  key={`${c.symbol}-${c.expiry ?? "no-expiry"}-${index}`}
                  className="border-b border-line/40 last:border-b-0 hover:bg-elevated/40"
                >
                  <td className="py-2 pr-3">
                    <StatusBadge tone={c.eligible ? "pos" : "mute"}>
                      {c.eligible ? "eligible" : "rejected"}
                    </StatusBadge>
                  </td>
                  <td className="py-2 pr-3 font-mono text-ink">{c.symbol}</td>
                  <td className="py-2 pr-3 font-mono tabular text-mute">{c.expiry ?? "—"}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular text-ink">
                    {c.days_to_expiry === null ? "—" : `${formatInt(c.days_to_expiry)}d`}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular text-ink">
                    {c.close === null ? "—" : c.close.toFixed(2)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular text-ink">
                    {c.volume_lots === null ? "—" : formatInt(c.volume_lots)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular text-ink">
                    {c.open_interest_lots === null ? "—" : formatInt(c.open_interest_lots)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular text-ink">
                    {c.value_lakhs === null ? "—" : c.value_lakhs.toFixed(2)}
                  </td>
                  <td className="max-w-[220px] py-2 pr-3">
                    {(c.reason ?? "").split("|").map((token) =>
                      token === "" ? null : (
                        <span
                          key={`${index}-${token}`}
                          className="mr-1 inline-block rounded border border-line bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-mute"
                        >
                          {token}
                        </span>
                      ),
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-[11px]">
                    {c.lot_size_g === null ? (
                      <span
                        className="text-warn"
                        title="No verified specification for this symbol — comparability unknown."
                      >
                        not verified
                      </span>
                    ) : (
                      <span className="text-mute">
                        {formatInt(c.lot_size_g)}g · qb {c.quote_basis_g}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hidden > 0 && (
        <p className="mt-2 text-xs text-mute">
          {formatInt(hidden)} more rows not rendered (performance guard).{" "}
          <button type="button" onClick={onShowAll} className="text-gold hover:underline">
            Show all {formatInt(sorted.length)}
          </button>
        </p>
      )}
    </div>
  );
}
