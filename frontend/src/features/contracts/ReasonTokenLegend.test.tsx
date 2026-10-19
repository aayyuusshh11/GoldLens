import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReasonTokenLegend } from "./ReasonTokenLegend";
import { sampleReport } from "../../test/helpers";

describe("ReasonTokenLegend — glosses only for tokens present in data", () => {
  it("lists the observed tokens verbatim with the confirmation caveat", () => {
    const report = sampleReport();
    render(<ReasonTokenLegend contracts={report.eligible_contracts} />);
    // Tokens observed in the supplied sample render verbatim (exact strings).
    expect(screen.getAllByText("symbol_not_verified").length).toBe(1);
    expect(screen.getByText("dte<21")).toBeInTheDocument();
    expect(screen.getByText(/observed in the supplied sample/i)).toBeInTheDocument();
  });

  it("stays honest for a dataset with no rejection tokens", () => {
    render(
      <ReasonTokenLegend
        contracts={[
          {
            trade_date: "2026-10-16",
            symbol: "GOLDM",
            expiry: "2026-12-04",
            days_to_expiry: 49,
            close: 147866,
            volume_lots: 1000,
            open_interest_lots: 2000,
            value_lakhs: 2000,
            eligible: true,
            reason: "",
            lot_size_g: 10000,
            quote_basis_g: 100,
          },
        ]}
      />,
    );
    expect(
      screen.getByText(/No rejection reason tokens in this dataset/i),
    ).toBeInTheDocument();
  });
});
