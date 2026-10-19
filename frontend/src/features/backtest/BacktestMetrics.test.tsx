import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { sampleReport } from "../../test/helpers";
import { BacktestMetrics } from "./BacktestMetrics";

const sample = sampleReport();

describe("BacktestMetrics with the bundled diagnostics sample", () => {
  it("labels itself diagnostics_only and cannot be mistaken for a result", () => {
    render(<BacktestMetrics report={sample} metrics={sample.metrics} variant="full" />);
    expect(screen.getAllByText("diagnostics_only").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/diagnostics, not a validated backtest/i)).toBeInTheDocument();
  });

  it("withholds net P&L with an explicit reason — never renders 0", () => {
    render(<BacktestMetrics report={sample} metrics={sample.metrics} variant="full" />);
    expect(sample.metrics?.net_pnl_rupees).toBeNull();
    expect(screen.getAllByText(/Withheld — costs not configured/i).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/Why these net figures are missing/i)).toBeInTheDocument();
    expect(screen.getByText(/gross of costs/i)).toBeInTheDocument();
  });

  it("renders the explicit zero for gross P&L as the pipeline reports it", () => {
    render(<BacktestMetrics report={sample} metrics={sample.metrics} variant="full" />);
    expect(screen.getByText(/Gross P/i)).toBeInTheDocument();
    expect(screen.getAllByText(/0\.00/).length).toBeGreaterThan(0);
  });

  it("flags win-rate and sharpe scale as pending quant confirmation", () => {
    render(<BacktestMetrics report={sample} metrics={sample.metrics} variant="full" />);
    expect(screen.getByText(/scale \(fraction vs %\)/i)).toBeInTheDocument();
    expect(screen.getByText(/annualization convention/i)).toBeInTheDocument();
  });

  it("renders pipeline notes verbatim", () => {
    render(<BacktestMetrics report={sample} metrics={sample.metrics} variant="full" />);
    for (const note of sample.metrics?.notes ?? []) {
      expect(screen.getByText(note)).toBeInTheDocument();
    }
  });

  it("handles a missing metrics block honestly", () => {
    render(<BacktestMetrics report={sample} metrics={null} variant="train" />);
    expect(screen.getByText(/no metrics block/i)).toBeInTheDocument();
    expect(screen.getByText(/Absent means absent/i)).toBeInTheDocument();
  });
});
