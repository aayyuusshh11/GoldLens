import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { makeApiConfig, renderWithApi } from "../../test/helpers";
import { fixtureDataQuality } from "../../lib/api/fixtures";
import { DataQualityPage } from "./DataQualityPage";

describe("DataQualityPage — the ingest's own accounting", () => {
  it("renders the sources table with file-level row accounting", async () => {
    renderWithApi(<DataQualityPage />, { config: makeApiConfig(), route: "/data-quality" });
    const dq = fixtureDataQuality();
    const firstSource = dq.sources[0];
    if (firstSource === undefined) throw new Error("fixture must contain at least one source");
    const source = await screen.findByText(firstSource.file);
    const row = source.closest("tr") as HTMLElement;
    expect(row.textContent).toContain("15,535"); // input_rows
    expect(row.textContent).toContain("15,535 / 0"); // accepted / rejected
    expect(row.textContent).toContain("15,535 / 0"); // inserted / skipped
    expect(row.textContent).toContain(firstSource.status); // "ingested"
  });

  it("lists every issue verbatim — including zero-count rows", async () => {
    renderWithApi(<DataQualityPage />, { config: makeApiConfig(), route: "/data-quality" });
    await screen.findByText("MISSING_SETTLEMENT_ROWS");
    const settlement = screen.getByText("MISSING_SETTLEMENT_ROWS").closest("li") as HTMLElement;
    expect(settlement.textContent).toContain("critical");
    expect(settlement.textContent).toContain("× 15,535");
    expect(settlement.textContent).toContain(
      "source has no settlement-price column; settlement unavailable for every row",
    );
    // Zero-count rows stay listed: a zero is a fact, not an omission.
    const zeroVolumeMissing = screen.getByText("MISSING_VOLUME_ROWS").closest("li") as HTMLElement;
    expect(zeroVolumeMissing.textContent).toContain("× 0");
    expect(zeroVolumeMissing.textContent).toContain(
      "rows with no volume observation (distinct from zero volume — never conflate)",
    );
  });

  it("shows rows totals, spec verification and the refused sufficiency gates", async () => {
    renderWithApi(<DataQualityPage />, { config: makeApiConfig(), route: "/data-quality" });
    const dq = fixtureDataQuality();
    await screen.findByText("Backtest refused");

    expect(screen.getByText("Row accounting")).toBeInTheDocument();
    expect(screen.getByText("14,730")).toBeInTheDocument(); // options_rows
    expect(screen.getByText(/Signal refused/)).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(
          `${dq.history_sufficiency.distinct_trade_dates} of ≥ ${dq.history_sufficiency.minimum_required}`,
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Unverified")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument(); // contract_spec_verification.unverified
    expect(screen.getByText("2026-10-16")).toBeInTheDocument(); // dates_available chip
    expect(screen.getByText(/Generated/)).toBeInTheDocument();
  });

  it("renders the methodology reference untouched", async () => {
    renderWithApi(<DataQualityPage />, { config: makeApiConfig(), route: "/data-quality" });
    await screen.findByText("Backtest refused");
    expect(screen.getByText("Honesty rules this UI enforces")).toBeInTheDocument();
    expect(screen.getByText(/Not a validated backtest until the validity gate passes/)).toBeInTheDocument();
  });
});
