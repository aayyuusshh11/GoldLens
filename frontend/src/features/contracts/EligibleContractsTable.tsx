import { useMemo, useState } from "react";
import type { ContractDTO } from "../../types/api";
import { formatInt, formatPrice } from "../../lib/formatters/format";
import { EmptyState } from "../../components/states/EmptyState";
import { VerificationBadge } from "../../components/layout/Badges";

const DEFAULT_VISIBLE = 40;

/**
 * Registry order: symbol ascending, then expiry ascending (a contract without
 * an expiry sorts after the dated ones within its symbol). The sort is the
 * component's own; nothing here reads network state.
 */
function sortContracts(contracts: ContractDTO[]): ContractDTO[] {
  return [...contracts].sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    const aExpiry = a.expiry_date ?? "";
    const bExpiry = b.expiry_date ?? "";
    if (aExpiry !== bExpiry) {
      if (aExpiry === "") return 1;
      if (bExpiry === "") return -1;
      return aExpiry.localeCompare(bExpiry);
    }
    return a.contract_id.localeCompare(b.contract_id);
  });
}

/**
 * Presentational contract-registry table over the NEW ContractDTO. Rows are
 * ordered (symbol, then expiry) and rendered inside an accessible table.
 * Every row — verified or not — renders whatever the API sent: null spec
 * fields show "—" (never zero, never inferred).
 *
 * Rendering budget: at most `visibleLimit` (default 40) rows render until the
 * user explicitly expands with "Show all N" (team rule — large registries must
 * not silently blow past the 40-row pass).
 */
export function EligibleContractsTable({
  contracts,
  visibleLimit = DEFAULT_VISIBLE,
}: {
  contracts: ContractDTO[];
  visibleLimit?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => sortContracts(contracts), [contracts]);

  if (sorted.length === 0) {
    return <EmptyState title="No contracts match the current filters" />;
  }

  const capActive = !showAll && sorted.length > visibleLimit;
  const visible = capActive ? sorted.slice(0, visibleLimit) : sorted;

  return (
    <div>
      <p aria-live="polite" className="mb-3 text-xs text-mute">
        Showing {formatInt(visible.length)} of {formatInt(sorted.length)} registry rows
        {capActive ? " · capped at 40 rows until expanded" : ""}
      </p>

      <div className="overflow-x-auto rounded-lg border border-line" style={{ maxHeight: "28rem" }}>
        <table className="w-full min-w-[900px] text-left text-sm">
          <caption className="sr-only">
            Contract registry — verification state of every ingested contract
          </caption>
          <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_0_#2A313A]">
            <tr className="text-[11px] uppercase tracking-widest text-mute">
              <th scope="col" className="py-2 pr-3 font-semibold">Contract</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Symbol</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Expiry</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Verification</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Verified fields</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Observed</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Tick size</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Contract size</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr
                key={c.contract_id}
                className="border-b border-line/40 last:border-b-0 hover:bg-elevated/40"
              >
                <td className="py-2 pr-3 font-mono text-xs text-ink">{c.contract_id}</td>
                <td className="py-2 pr-3 font-mono text-ink">{c.symbol}</td>
                <td className="py-2 pr-3 font-mono tabular text-mute">{c.expiry_date ?? "—"}</td>
                <td className="py-2 pr-3">
                  <VerificationBadge status={c.verification_status} />
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular text-ink">
                  {c.verified_fields.length === 0 ? "—" : formatInt(c.verified_fields.length)}
                </td>
                <td className="py-2 pr-3 font-mono text-xs tabular text-mute">
                  {c.first_observed_date ?? "—"} → {c.last_observed_date ?? "—"}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular text-ink">
                  {c.tick_size === null ? "—" : formatPrice(c.tick_size)}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular text-ink">
                  {c.contract_size === null ? "—" : formatInt(c.contract_size)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > visibleLimit && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-medium text-gold hover:underline"
          >
            {showAll
              ? `Show ${formatInt(visibleLimit)} only`
              : `Show all ${formatInt(sorted.length)}`}
          </button>
        </div>
      )}
    </div>
  );
}
