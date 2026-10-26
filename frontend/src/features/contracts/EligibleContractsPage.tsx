import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { ContractDTO } from "../../types/api";
import { useApi } from "../../app/ApiContext";
import { formatInt } from "../../lib/formatters/format";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataNotice } from "../../components/primitives/DataNotice";
import { LoadingState } from "../../components/states/LoadingState";
import { ErrorState } from "../../components/states/ErrorState";
import { ReasonTokenLegend } from "./ReasonTokenLegend";
import { EligibleContractsTable } from "./EligibleContractsTable";
import { EmptyState } from "../../components/states/EmptyState";

type VerificationFilter = "all" | "verified" | "unverified";

/**
 * Contract registry over GET /api/contracts, verification first: eligibility
 * cannot be asserted while specs are unverified, so the page reports the
 * verification state and keeps unverified rows plainly visible. Symbol +
 * verification filters are explicit local controls (not URL state), and the
 * table renders at most 40 rows until the user expands it.
 */
export function EligibleContractsPage() {
  const { contracts, refreshContracts, symbols, pairs } = useApi();
  const [symbolFilter, setSymbolFilter] = useState<string>("All");
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("all");

  /** Registry tokens actually present: reason codes carried by the pairs data. */
  const legendTokens = useMemo(() => {
    const present = new Set<string>();
    if (pairs.key === "ready" && pairs.data !== null) {
      for (const pair of pairs.data.pairs) {
        for (const code of pair.reason_codes) present.add(code);
      }
    }
    return [...present].sort();
  }, [pairs]);

  if (contracts.data === null) {
    return (
      <div>
        <PageHeader
          kicker="Contracts"
          title="Contract registry — verification first"
          subtitle="Ingested contracts and their verification state from GET /api/contracts."
        />
        {contracts.key === "error" && contracts.error !== null ? (
          <ErrorState
            error={contracts.error}
            title="Contract registry failed"
            onRetry={refreshContracts}
          />
        ) : contracts.key === "ready" ? (
          <EmptyState title="No contract registry data returned" />
        ) : (
          <LoadingState label="Loading contract registry…" rows={6} wide />
        )}
      </div>
    );
  }

  const all: ContractDTO[] = contracts.data.contracts;
  const filtered = all
    .filter((c) => symbolFilter === "All" || c.symbol === symbolFilter)
    // "Unverified" means "no verified spec yet": conflicting rows are not
    // verified either, so they stay in that bucket (never hidden).
    .filter((c) =>
      verificationFilter === "verified"
        ? c.verification_status === "verified"
        : verificationFilter === "unverified"
          ? c.verification_status !== "verified"
          : true,
    );
  const verifiedCount = filtered.filter((c) => c.verification_status === "verified").length;
  const notVerifiedCount = filtered.length - verifiedCount;

  return (
    <div>
      <PageHeader
        kicker="Contracts"
        title="Contract registry — verification first"
        subtitle="Eligibility cannot be asserted while specifications are unverified, so this registry shows the verification state of every contract instead. Unverified rows stay visible by default; narrowing them is an explicit choice."
        actions={
          <button
            type="button"
            onClick={refreshContracts}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-1.5 text-sm font-medium text-ink hover:border-gold/60"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Refresh registry
          </button>
        }
      />

      {contracts.refreshing && (
        <div className="mb-4">
          <DataNotice tone="warn" title="Refreshing registry…">
            Updating from the API — the values below are the last good data.
          </DataNotice>
        </div>
      )}
      {contracts.key === "error" && contracts.error !== null && (
        <div className="mb-4">
          <DataNotice tone="warn" title="Refresh failed — showing the last good data">
            <p>{contracts.error.message}</p>
          </DataNotice>
        </div>
      )}

      <div className="mb-4">
        <DataNotice tone="warn" title="Specification fields stay null until verified">
          Contract size, units, tick size, purity and expiry rule come only from an
          authoritative source; the registry never infers them from symbol names. While a
          contract reads <span className="text-warn">unverified</span>, its spec columns show
          &ldquo;—&rdquo; and no eligibility claim is made for it.
        </DataNotice>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm text-mute">
          <span>Symbol</span>
          <select
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            className="rounded-lg border border-line bg-elevated px-2 py-1.5 text-sm text-ink"
          >
            <option value="All">All symbols</option>
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-mute">
          <span>Verification</span>
          <select
            value={verificationFilter}
            onChange={(e) => setVerificationFilter(e.target.value as VerificationFilter)}
            className="rounded-lg border border-line bg-elevated px-2 py-1.5 text-sm text-ink"
          >
            <option value="all">All</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>
        </label>

        <p aria-live="polite" className="text-xs text-mute">
          {formatInt(filtered.length)} of {formatInt(all.length)} registry contracts match ·{" "}
          {formatInt(verifiedCount)} verified · {formatInt(notVerifiedCount)} not verified
        </p>
      </div>

      <div className="mb-4">
        <ReasonTokenLegend tokens={legendTokens} />
      </div>

      <EligibleContractsTable contracts={filtered} />
    </div>
  );
}
