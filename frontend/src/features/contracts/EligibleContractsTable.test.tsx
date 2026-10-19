import { useState } from "react";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@testing-library/react";
import type { EligibleContractDTO } from "../../types/api";
import { sampleReport } from "../../test/helpers";
import { EligibleContractsTable, type SortKey } from "./EligibleContractsTable";

const sample = sampleReport();

/** Stable synthetic universe: sample rows duplicated to pass the 40-row budget. */
function syntheticContracts(total: number): EligibleContractDTO[] {
  const base = sample.eligible_contracts[0];
  if (base === undefined) throw new Error("fixture must contain at least one eligible contract");
  const clones: EligibleContractDTO[] = Array.from({ length: total }, (_, i) => ({
    ...base,
    symbol: `SYN${String(i).padStart(2, "0")}`,
  }));
  return [...sample.eligible_contracts, ...clones];
}

/** Stateful harness — the production table is controlled, so the test wraps it
 * with real state, mirroring EligibleContractsPage. */
function Harness({ contracts }: { contracts: EligibleContractDTO[] }) {
  const [search, setSearch] = useState("");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "eligible",
    dir: "desc",
  });

  return (
    <EligibleContractsTable
      contracts={contracts}
      search={search}
      eligibleOnly={eligibleOnly}
      verifiedOnly={verifiedOnly}
      sort={sort}
      visibleCount={visibleCount}
      onToggleSort={(key) =>
        setSort((prev) =>
          prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
        )
      }
      onShowAll={() => setVisibleCount(contracts.length)}
      onSearch={setSearch}
      onToggleEligibleOnly={() => setEligibleOnly((v) => !v)}
      onToggleVerifiedOnly={() => setVerifiedOnly((v) => !v)}
    />
  );
}

describe("EligibleContractsTable", () => {
  it("caps rendering at 40 rows and exposes the performance-guard control", () => {
    const contracts = syntheticContracts(45);
    render(<Harness contracts={contracts} />);
    expect(screen.getByText(/Show all/)).toBeInTheDocument();
    // visible = 40, hidden = contracts.length − 40 (regardless of sample size).
    expect(
      screen.getByText(new RegExp(`${contracts.length - 40} more rows not rendered`)),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Showing 40 of ${contracts.length} filtered contracts`))).toBeInTheDocument();
  });

  it("renders every row after Show all is clicked", async () => {
    const user = userEvent.setup();
    const contracts = syntheticContracts(45);
    render(<Harness contracts={contracts} />);
    await user.click(screen.getByRole("button", { name: new RegExp(`Show all ${contracts.length}`) }));
    expect(
      screen.getByText(new RegExp(`Showing ${contracts.length} of ${contracts.length} filtered contracts`)),
    ).toBeInTheDocument();
  });

  it("narrows the filtered set from the search box", async () => {
    const user = userEvent.setup();
    const contracts = syntheticContracts(45);
    render(<Harness contracts={contracts} />);
    await user.type(screen.getByPlaceholderText(/Search symbol or reason/i), "SYN07");
    expect(screen.getByText(/Showing 1 of 1/)).toBeInTheDocument();
  });

  it("marks the sorted column via aria-sort", async () => {
    const user = userEvent.setup();
    render(<Harness contracts={syntheticContracts(45)} />);
    const symbolHeader = screen.getByRole("columnheader", { name: /^Symbol/i });
    expect(symbolHeader).toHaveAttribute("aria-sort", "none");
    await user.click(within(symbolHeader).getByRole("button"));
    expect(symbolHeader).toHaveAttribute("aria-sort", "ascending");
    await user.click(within(symbolHeader).getByRole("button"));
    expect(symbolHeader).toHaveAttribute("aria-sort", "descending");
  });

  it("keeps real sample rows visible with both eligible and rejected statuses", () => {
    render(<Harness contracts={sample.eligible_contracts} />);
    expect(screen.getAllByText("rejected").length).toBeGreaterThan(0);
    expect(screen.getAllByText("eligible").length).toBeGreaterThan(0);
  });

  it("renders the filter affordances", () => {
    render(<Harness contracts={sample.eligible_contracts} />);
    expect(screen.getByText("Eligible only")).toBeInTheDocument();
    expect(screen.getByText("Verified spec only")).toBeInTheDocument();
  });
});
