import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { makeApiConfig, renderWithApi } from "../../test/helpers";
import { fixtureDataQuality, fixturePairs } from "../../lib/api/fixtures";
import { OverviewPage } from "./OverviewPage";

function panelByTitle(title: string): HTMLElement {
  return screen.getByText(title).closest("section") as HTMLElement;
}

describe("OverviewPage — dataset gates, pair and decision preview", () => {
  it("shows skeletons first, then the sufficiency gates with verbatim numbers", async () => {
    renderWithApi(<OverviewPage />, { config: makeApiConfig() });
    // Simultaneous initial render: every slice starts on its skeleton
    // (LoadingState surfaces its label as aria-label, not visible text).
    expect(screen.getAllByLabelText(/Loading data-quality report/).length).toBeGreaterThan(0);

    const dqReport = fixtureDataQuality();
    await screen.findByText("Backtest refused");
    const panel = within(panelByTitle("History sufficiency"));
    expect(panel.getByText("Signal refused")).toBeInTheDocument();
    expect(
      panel.getByText(
        new RegExp(
          `≥ ${dqReport.history_sufficiency.minimum_required} distinct trade dates — ${dqReport.history_sufficiency.distinct_trade_dates} stored`,
        ),
      ),
    ).toBeInTheDocument();
    expect(panel.getByText(/1 date\(s\) available/)).toBeInTheDocument();
    expect(panel.getByText("16 Oct 2026 → 16 Oct 2026")).toBeInTheDocument();
  });

  it("renders the selected pair with its candidate-only status and reason codes", async () => {
    renderWithApi(<OverviewPage />, { config: makeApiConfig() });
    const firstPair = fixturePairs().pairs[0]; // fixture: first GOLDM adjacent-expiry pair
    if (firstPair === undefined) throw new Error("fixture must contain at least one pair");
    const pairId = firstPair.pair_id;
    await screen.findByText(pairId);
    const panel = within(panelByTitle("Selected pair"));
    expect(panel.getByText("Candidate only")).toBeInTheDocument();
    expect(panel.getByText("unverified spec")).toBeInTheDocument();
    expect(panel.getByText("2026-11-05 → 2026-12-04")).toBeInTheDocument();
    expect(panel.getByText(/1 trade date\(s\)/)).toBeInTheDocument();
  });

  it("summarizes issues by severity and spec-verification counts", async () => {
    renderWithApi(<OverviewPage />, { config: makeApiConfig() });
    await screen.findByText("critical");
    const panel = within(panelByTitle("Data quality"));
    expect(panel.getByText("critical")).toBeInTheDocument();
    expect(panel.getByText(/5 issue kinds/)).toBeInTheDocument(); // warnings in the fixture
    expect(panel.getByText("Unverified")).toBeInTheDocument();
    expect(panel.getByText("12")).toBeInTheDocument();
    // verified and conflicting are true zeros from the payload (displayed, not hidden)
    expect(panel.getAllByText("0").length).toBeGreaterThanOrEqual(2);
  });

  it("previews the NO_TRADE decision and states null quant fields honestly", async () => {
    renderWithApi(<OverviewPage />, { config: makeApiConfig() });
    const panel = within(await screen.findByText("No trade").then(() => panelByTitle("Latest decision for the selected pair")));
    expect(panel.getAllByText("insufficient history").length).toBeGreaterThan(0);
    expect(panel.getAllByText("unverified spec").length).toBeGreaterThan(0);
    // z/metrics nulls: stated as not computed, never rendered as 0
    expect(
      screen.getAllByText(/not computed — quant service not wired/i).length,
    ).toBeGreaterThanOrEqual(2);
    expect(panel.getByText(/overriding would fabricate values/i)).toBeInTheDocument();
    // spread is real: 146425 − 147866
    expect(panel.getByText(/1,441\.00/)).toBeInTheDocument();
  });

  it("still links onward to the deep-dive screens", async () => {
    renderWithApi(<OverviewPage />, { config: makeApiConfig() });
    await screen.findByText("History sufficiency");
    expect(screen.getByRole("link", { name: /Pair Explorer/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Signal Forensics/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Data Quality/ })).toBeInTheDocument();
  });
});
