import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { ReportProvider } from "../../app/ReportContext";
import { AppShell } from "./AppShell";

/**
 * Full shell render in default fixture mode: the provider loads the bundled
 * sample (delay default = 250 ms), so assertions wait for the ready state.
 */
function renderShell() {
  return render(
    <ReportProvider>
      <MemoryRouter initialEntries={["/pair"]}>
        <AppShell>
          <p data-testid="route-content">pair page body</p>
        </AppShell>
      </MemoryRouter>
    </ReportProvider>,
  );
}

describe("AppShell in fixture mode", () => {
  it("always shows the fixture banner while the sample loads/renders", async () => {
    renderShell();
    expect(await screen.findByText(/Fixture mode — bundled diagnostic sample/i, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/diagnostics only, not performance/i)).toBeInTheDocument();
  });

  it("labels the data source pill and never claims live API", async () => {
    renderShell();
    expect(await screen.findByText(/Fixture · sample data/i, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText(/API live/i)).not.toBeInTheDocument();
  });

  it("offers the family selector with both report families", async () => {
    renderShell();
    const select = await screen.findByRole("combobox", { name: /contract family/i }, { timeout: 5000 });
    expect(select).toHaveValue("GOLDM");
    for (const option of ["GOLD", "GOLDM"]) {
      // Options are children of the select.
      const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
      expect(options).toContain(option);
    }
  });

  it("renders the primary navigation with all six screens", async () => {
    renderShell();
    const nav = await screen.findByRole("navigation", { name: "Primary" }, { timeout: 5000 });
    for (const label of ["Overview", "Pair Explorer", "Signal Forensics", "Backtest", "Eligible Contracts", "Data Quality"]) {
      expect(nav).toHaveTextContent(label);
    }
  });

  it("shows the research-advisory footer with the fixture source line", async () => {
    renderShell();
    expect(await screen.findByText(/not trading advice/i, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/data source: bundled sample fixture/i)).toBeInTheDocument();
  });

  it("renders routed content inside main", async () => {
    renderShell();
    expect(await screen.findByTestId("route-content", {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
