import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import { makeApiConfig, renderWithApi } from "../../test/helpers";
import { PairExplorerPage } from "./PairExplorerPage";

/**
 * Fixture mode (0 delay) drives the real data pipeline: GOLD/GOLDM 1-day
 * mirror with candidate_only pairs, negative spreads (near − far) and
 * verbatim warnings. Assertions target honest behavior, not pretty numbers.
 */

async function renderPairExplorer(config = makeApiConfig()) {
  const view = renderWithApi(<PairExplorerPage />, { config });
  // Wait for the auto-selected pair's history to land.
  await screen.findByRole("button", { name: /GOLDM_near20261105_far20261204/ });
  return view;
}

describe("PairExplorerPage — pair picker", () => {
  it("lists every adjacent pair for the selected symbol with status + history days", async () => {
    await renderPairExplorer();
    for (const pairId of [
      "GOLDM_near20261105_far20261204",
      "GOLDM_near20261204_far20270105",
      "GOLDM_near20270105_far20270205",
      "GOLDM_near20270205_far20270305",
      "GOLDM_near20270305_far20270405",
    ]) {
      const button = screen.getByRole("button", { name: new RegExp(pairId) });
      expect(within(button).getByText(/candidate only/i)).toBeInTheDocument();
      expect(within(button).getByText(/overlapping trade date/i)).toBeInTheDocument();
    }
  });

  it("marks the auto-selected pair and switches selection on click", async () => {
    const user = userEvent.setup();
    await renderPairExplorer();
    const first = screen.getByRole("button", { name: /GOLDM_near20261105_far20261204/ });
    // The provider auto-picks the first pair after pairs load — wait for it.
    await waitFor(() => expect(first).toHaveAttribute("aria-pressed", "true"));

    const second = screen.getByRole("button", { name: /GOLDM_near20261204_far20270105/ });
    await user.click(second);
    await waitFor(() => expect(second).toHaveAttribute("aria-pressed", "true"));
    expect(first).toHaveAttribute("aria-pressed", "false");
  });
});

describe("PairExplorerPage — selected pair panel", () => {
  it("shows near/far legs with contract ids and expiries", async () => {
    await renderPairExplorer();
    expect(await screen.findByText(/FUTCOM_GOLDM_20261105 · expires 2026-11-05/)).toBeInTheDocument();
    expect(screen.getByText(/FUTCOM_GOLDM_20261204 · expires 2026-12-04/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /candidate pairs for GOLDM/i }),
    ).toBeInTheDocument();
  });
});

describe("PairExplorerPage — spread history (honest math)", () => {
  it("renders the presentation-only stats band with count, min/max spread and reference rows", async () => {
    await renderPairExplorer();
    await screen.findByText("Rows");
    expect(screen.getByText("Min spread (₹)")).toBeInTheDocument();
    // Spread = near − far for the fixture single session: 146425 − 147866 = −1441.
    expect(screen.getAllByText(/1,441\.00/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/^0$/).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/Presentation math over the returned rows only/i),
    ).toBeInTheDocument();
  });

  it("renders history warnings verbatim with severity", async () => {
    await renderPairExplorer();
    expect(
      await screen.findByText(/this is reference data, not a history series/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("warning").length).toBeGreaterThanOrEqual(1);
  });

  it("stamps reference_only rows distinctly in legend and footer", async () => {
    await renderPairExplorer();
    expect(
      await screen.findByText("spread · reference_only — not tradable history"),
    ).toBeInTheDocument();
    expect(screen.getByText(/spread \(₹\) — tradable observations/)).toBeInTheDocument();
    expect(screen.getByText(/near expiry close \(₹\)/)).toBeInTheDocument();
    expect(screen.getByText(/Hollow\/dashed marks = reference_only rows/i)).toBeInTheDocument();
  });

  it("counts reference_only rows after switching to a zero-volume GOLD pair", async () => {
    const user = userEvent.setup();
    renderWithApi(<PairExplorerPage />, { config: makeApiConfig({ defaultSymbol: "GOLD" }) });

    const referencePair = await screen.findByRole("button", {
      name: /GOLD_near20270205_far20270405/,
    });
    await user.click(referencePair);

    // The band's reference-only counter must expose 1 of 1 rows once history lands.
    const band = screen.getByText("reference_only rows").parentElement as HTMLElement;
    await waitFor(() => expect(within(band).getByText(/^1$/)).toBeInTheDocument());
  });

  it("offers a Refresh history control", async () => {
    await renderPairExplorer();
    expect(screen.getByRole("button", { name: /refresh history/i })).toBeInTheDocument();
  });
});
