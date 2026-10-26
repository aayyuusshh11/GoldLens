import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { makeApiConfig, renderWithApi } from "../../test/helpers";
import { SignalForensicsPage } from "./SignalForensicsPage";

/**
 * Light honest-behavior pass over the signal forensics page in fixture mode:
 * NO_TRADE decision, null quant fields explained (never zero), data-quality
 * block and backend notes rendered verbatim.
 */

async function renderSignalForensics(config = makeApiConfig()) {
  renderWithApi(<SignalForensicsPage />, { config });
  await screen.findByText("No trade"); // DecisionBadge for the fixture's NO_TRADE
}

describe("SignalForensicsPage (fixture mode)", () => {
  it("renders the NO_TRADE decision prominently with its reason codes", async () => {
    await renderSignalForensics();
    // DecisionBadge renders the settled decision token, human-readable.
    expect(screen.getAllByText("No trade").length).toBeGreaterThanOrEqual(1);

    const strip = screen.getByText(/insufficient history/i).closest("div") as HTMLElement;
    expect(strip).toBeInTheDocument();
    expect(within(strip.parentElement as HTMLElement).getByText(/unverified spec/i)).toBeInTheDocument();
  });

  it("explains null quant fields honestly — they are never shown as zero", async () => {
    await renderSignalForensics();
    expect(
      await screen.findByText(/not computed — quant service not wired/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/the backend refuses to fabricate/)).toBeInTheDocument();
    expect(screen.getByText(/Absence spotted|Absent means absent/i)).toBeInTheDocument();
  });

  it("shows the spread value and as-of date as returned", async () => {
    await renderSignalForensics();
    // GOLDM fixture session: spread = 146425 − 147866 = −1441 ₹.
    expect(screen.getAllByText(/1,441\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/16 Oct 2026/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders the data-quality block with verbatim warnings", async () => {
    await renderSignalForensics();
    expect(screen.getByText("distinct_trade_dates")).toBeInTheDocument();
    expect(screen.getByText("trading_days_available")).toBeInTheDocument();
    expect(
      screen.getByText("1 distinct trading date(s) stored; rolling z-score requires more history"),
    ).toBeInTheDocument();
  });

  it("renders backend notes verbatim in the notice", async () => {
    await renderSignalForensics();
    expect(screen.getByText(/overriding would fabricate values from one day of data/)).toBeInTheDocument();
  });

  it("keeps recent-sessions context (no z series exists) with a refresh control", async () => {
    await renderSignalForensics();
    expect(screen.getByText(/no z series exists/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-analyze signal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh history/i })).toBeInTheDocument();
  });
});
