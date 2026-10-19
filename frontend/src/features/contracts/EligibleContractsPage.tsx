import { useMemo, useState } from "react";
import type { BacktestReportDTO, EligibleContractDTO } from "../../types/api";
import { eligibleCounts } from "../../lib/reportAnalysis";
import { formatInt } from "../../lib/formatters/format";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataNotice } from "../../components/primitives/DataNotice";
import { StatusBadge } from "../../components/layout/Badges";
import { ReasonTokenLegend } from "./ReasonTokenLegend";
import { EligibleContractsTable, type SortKey } from "./EligibleContractsTable";

/** Latest-session eligibility snapshot with searchable/sortable registry. */
export function EligibleContractsPage({ report }: { report: BacktestReportDTO }) {
  const counts = useMemo(
    () => eligibleCounts(report.eligible_contracts),
    [report.eligible_contracts],
  );
  const [search, setSearch] = useState("");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "eligible",
    dir: "desc",
  });

  const toggleSort = (key: SortKey): void =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const snapshotDate: EligibleContractDTO["trade_date"] =
    report.eligible_contracts[0]?.trade_date ?? null;

  return (
    <div>
      <PageHeader
        kicker="Eligible Contracts"
        title={`Registry snapshot — ${report.pair.symbol} family filter universe`}
        subtitle="Eligibility and rejection reasons come verbatim from the pipeline's latest trading day. Rejections stay visible; filtering is always an explicit user action."
        actions={
          snapshotDate !== null ? (
            <StatusBadge tone="mute" title="Trade date of the eligibility snapshot">
              as of {snapshotDate}
            </StatusBadge>
          ) : undefined
        }
      />

      <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3">
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Eligible</dt>
          <dd className="font-mono tabular text-sm text-pos">{formatInt(counts.eligible)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Rejected</dt>
          <dd className="font-mono tabular text-sm text-mute">{formatInt(counts.rejected)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Verified spec (lot size)</dt>
          <dd className="font-mono tabular text-sm text-ink">{formatInt(counts.verifiedSpec)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Unverified spec</dt>
          <dd className="font-mono tabular text-sm text-warn">
            {formatInt(report.eligible_contracts.length - counts.verifiedSpec)}
          </dd>
        </div>
      </dl>

      <div className="mb-4">
        <DataNotice tone="warn" title="Unverified specifications are not comparable">
          Contracts with a null lot size have no verified specification record; their
          prices must not be compared across symbols. Such rows are tagged{" "}
          <span className="text-warn">not verified</span> below and can be filtered with
          &quot;Verified spec only&quot;. The quant registry never infers specs from symbol
          names.
        </DataNotice>
      </div>

      <div className="mb-4">
        <ReasonTokenLegend contracts={report.eligible_contracts} />
      </div>

      <EligibleContractsTable
        contracts={report.eligible_contracts}
        search={search}
        eligibleOnly={eligibleOnly}
        verifiedOnly={verifiedOnly}
        sort={sort}
        onToggleSort={toggleSort}
        visibleCount={visibleCount}
        onShowAll={() => setVisibleCount(report.eligible_contracts.length)}
        onSearch={setSearch}
        onToggleEligibleOnly={() => setEligibleOnly((v) => !v)}
        onToggleVerifiedOnly={() => setVerifiedOnly((v) => !v)}
      />
    </div>
  );
}
