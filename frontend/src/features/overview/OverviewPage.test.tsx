import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, within } from "@testing-library/react";
import { sampleReport } from "../../test/helpers";
import { OverviewPage } from "./OverviewPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <OverviewPage report={sampleReport()} />
    </MemoryRouter>,
  );
}

describe("OverviewPage with the bundled diagnostics sample", () => {
  it("leads with the invalid-backtest verdict (badge + verbatim verdict paragraph)", () => {
    renderPage();
    expect(screen.getAllByText(/NOT A VALID BACKTEST/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Not a valid backtest")).toBeInTheDocument();
  });

  it("marks the run as a very short history (1 trading day)", () => {
    renderPage();
    expect(screen.getByText("very short history")).toBeInTheDocument();
  });

  it("shows the diagnostics-only metrics badge and withheld-costs notice", () => {
    renderPage();
    expect(screen.getByText("Diagnostics only")).toBeInTheDocument();
    expect(screen.getByText(/Costs are not configured/)).toBeInTheDocument();
  });

  it("surfaces provenance and eligibility snapshot facts", () => {
    renderPage();
    expect(screen.getByText(/single session/i)).toBeInTheDocument();
    expect(screen.getByText(/Eligibility snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/Where to look next/i)).toBeInTheDocument();
  });

  it("links onward to the deep-dive screens", () => {
    renderPage();
    const pair = screen.getByRole("link", { name: /Pair Explorer/ });
    const signals = screen.getByRole("link", { name: /Signal Forensics/ });
    const dq = screen.getByRole("link", { name: /Data Quality/ });
    expect(within(pair).getByText(/spread history/)).toBeInTheDocument();
    expect(within(signals).getByText(/each date acted/)).toBeInTheDocument();
    expect(within(dq).getByText(/provenance/i)).toBeInTheDocument();
  });
});
