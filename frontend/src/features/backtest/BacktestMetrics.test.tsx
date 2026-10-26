import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { BacktestRunDTO } from "../../types/api";
import { BacktestMetrics } from "./BacktestMetrics";

/**
 * BacktestMetrics renders one settled run honestly: runnable:false becomes a
 * prominent refusal notice; null metrics render "— withheld" with the run's
 * own warnings as the reason, verbatim — never a fabricated 0.
 */

const REFUSAL_WARNING = "1 distinct trading date(s) stored (< required for walk-forward); backtest refused";

function refusedRun(): BacktestRunDTO {
  return {
    run_id: "bt_refused_0001",
    pair_id: "GOLDM_near20261105_far20261204",
    strategy_version: "default",
    evaluation_period: { start_date: null, end_date: null },
    observation_count: 1,
    completed_trades: 0,
    gross_pnl: null,
    estimated_costs: null,
    net_pnl: null,
    max_drawdown: null,
    assumptions: [],
    warnings: [
      { code: "INSUFFICIENT_HISTORY", severity: "error", count: 1, message: REFUSAL_WARNING },
    ],
    runnable: false,
  };
}

function runnableRun(): BacktestRunDTO {
  return {
    run_id: "bt_run_0001",
    pair_id: "GOLDM_near20261105_far20261204",
    strategy_version: "default",
    evaluation_period: { start_date: "2026-10-01", end_date: "2026-10-16" },
    observation_count: 12,
    completed_trades: 3,
    gross_pnl: 1500,
    estimated_costs: 75,
    net_pnl: 1425,
    max_drawdown: 300,
    assumptions: ["Closes are settlement-grade per contract registry."],
    warnings: [],
    runnable: true,
  };
}

describe("BacktestMetrics — refused run (runnable false)", () => {
  const sample = refusedRun();

  it("leads with the refusal notice and renders the backend warnings verbatim", () => {
    render(<BacktestMetrics run={sample} />);
    expect(screen.getByText("Evaluation refused — runnable is false")).toBeInTheDocument();
    expect(screen.getByText("refused · runnable false")).toBeInTheDocument();
    // Refusal notice + withheld-reasons block both repeat the run's warnings.
    expect(screen.getAllByText(REFUSAL_WARNING).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("INSUFFICIENT_HISTORY").length).toBeGreaterThanOrEqual(1);
  });

  it("renders null metrics as — withheld, never as 0", () => {
    render(<BacktestMetrics run={sample} />);
    expect(sample.gross_pnl).toBeNull();
    expect(screen.getAllByText("— withheld").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/Why the figures above are withheld/i)).toBeInTheDocument();
  });

  it("shows run identity, counts and evaluation period as returned", () => {
    render(<BacktestMetrics run={sample} />);
    expect(screen.getByText(/run_id: bt_refused_0001/)).toBeInTheDocument();
    expect(screen.getByText(/strategy default/)).toBeInTheDocument();
    expect(screen.getByText("Observations")).toBeInTheDocument();
    expect(screen.getByText("Completed trades")).toBeInTheDocument();
  });

  it("states when no assumptions were returned", () => {
    render(<BacktestMetrics run={sample} />);
    expect(screen.getByText("No assumptions were returned for this run.")).toBeInTheDocument();
  });
});

describe("BacktestMetrics — runnable run with computed metrics", () => {
  const sample = runnableRun();

  it("has no refusal copy and marks the run runnable", () => {
    render(<BacktestMetrics run={sample} />);
    expect(screen.getByText("runnable")).toBeInTheDocument();
    expect(screen.queryByText(/refused/i)).not.toBeInTheDocument();
  });

  it("renders computed figures with rupee formatting and units", () => {
    render(<BacktestMetrics run={sample} />);
    expect(screen.getByText(/₹\s*1,500\.00/)).toBeInTheDocument();
    expect(screen.getByText(/₹\s*1,425\.00/)).toBeInTheDocument();
    expect(screen.getByText(/gross of costs/)).toBeInTheDocument();
  });

  it("renders the evaluation period boundaries and no withheld banner", () => {
    render(<BacktestMetrics run={sample} />);
    const period = screen.getByText("Evaluation period").closest("div") as HTMLElement;
    expect(within(period).getByText(/1 Oct 2026 → 16 Oct 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Why the figures above are withheld/i)).not.toBeInTheDocument();
  });

  it("lists assumptions verbatim", () => {
    render(<BacktestMetrics run={sample} />);
    expect(
      screen.getByText("Closes are settlement-grade per contract registry."),
    ).toBeInTheDocument();
  });
});
