import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import type { ContractDTO } from "../../types/api";
import { EligibleContractsTable } from "./EligibleContractsTable";

/** Synthetic ContractDTO factory with every settled field spelled out. */
function makeContract(overrides: Partial<ContractDTO> = {}): ContractDTO {
  return {
    contract_id: "FUTCOM_GOLDM_20991231",
    symbol: "GOLDM",
    instrument_type: "FUTCOM",
    expiry_date: "2099-12-31",
    contract_size: null,
    units: null,
    quotation_unit: null,
    purity: null,
    tick_size: null,
    expiry_rule: null,
    verification_status: "unverified",
    verified_fields: [],
    source: null,
    verification_timestamp: null,
    effective_from: null,
    effective_to: null,
    first_observed_date: "2026-10-16",
    last_observed_date: "2026-10-16",
    updated_at: null,
    ...overrides,
  };
}

describe("EligibleContractsTable (new ContractDTO)", () => {
  it("normalizes rows to symbol → expiry order and shows unverified by default", () => {
    render(
      <EligibleContractsTable
        contracts={[
          makeContract({ contract_id: "FUTCOM_GOLDM_20261204", symbol: "GOLDM", expiry_date: "2026-12-04" }),
          makeContract({ contract_id: "FUTCOM_GOLD_20270205", symbol: "GOLD", expiry_date: "2027-02-05" }),
          makeContract({ contract_id: "FUTCOM_GOLD_20261204", symbol: "GOLD", expiry_date: "2026-12-04" }),
        ]}
      />,
    );
    const rows = screen.getAllByRole("row");
    // header row + 3 data rows in (GOLD 12-04, GOLD 02-05, GOLDM 12-04) order.
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent("FUTCOM_GOLD_20261204");
    expect(rows[2]).toHaveTextContent("FUTCOM_GOLD_20270205");
    expect(rows[3]).toHaveTextContent("FUTCOM_GOLDM_20261204");
    expect(screen.getAllByText("Unverified").length).toBe(3);
  });

  it("renders null spec fields as em-dashes — never zero, never invented", () => {
    render(
      <EligibleContractsTable
        contracts={[
          makeContract({
            contract_id: "FUTCOM_GOLDM_20261204",
            expiry_date: null,
            verified_fields: [],
            first_observed_date: null,
          }),
        ]}
      />,
    );
    const row = screen.getAllByRole("row")[1] as HTMLElement;
    expect(row.textContent).toContain("—"); // expiry null → —
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4); // expiry, fields, observed, tick, size
  });

  it("shows verified-field counts only when fields exist", () => {
    render(
      <EligibleContractsTable
        contracts={[
          makeContract({
            verification_status: "verified",
            verified_fields: ["contract_size", "tick_size"],
            tick_size: 1,
            contract_size: 10000,
          }),
        ]}
      />,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1.00")).toBeInTheDocument(); // tick_size
    expect(screen.getByText("10,000")).toBeInTheDocument(); // contract_size
  });

  it("caps rendering at 40 rows with an explicit Show all toggle (limit rule)", async () => {
    const user = userEvent.setup();
    const contracts = Array.from({ length: 45 }, (_, i) =>
      makeContract({ symbol: `SYN${String(i).padStart(2, "0")}` }),
    );
    render(<EligibleContractsTable contracts={contracts} />);

    expect(screen.getByText(/Showing 40 of 45 registry rows/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show all 45" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show all 45" }));
    expect(screen.getByText(/Showing 45 of 45 registry rows/)).toBeInTheDocument();
    // The control stays available to collapse back under the 40-row budget.
    expect(screen.getByRole("button", { name: "Show 40 only" })).toBeInTheDocument();
  });

  it("shows the honest empty state for an empty registry slice", () => {
    render(<EligibleContractsTable contracts={[]} />);
    expect(screen.getByText(/No contracts match/i)).toBeInTheDocument();
  });
});
