import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfigChips } from "./ConfigChips";
import { sampleReport } from "../../test/helpers";

describe("ConfigChips — run configuration renders verbatim and warns on costs", () => {
  it("renders every supplied config value with its unit label", () => {
    const report = sampleReport();
    render(<ConfigChips report={report} idPrefix="t" />);
    for (const chip of [
      `${report.config.lookback_days}d`,
      String(report.config.z_entry),
      String(report.config.z_exit),
      String(report.config.stop_z),
      `${report.config.min_hist_days}d`,
      `${report.config.max_holding_days}d`,
      report.config.exec_mode,
      String(report.config.walk_forward_folds),
    ]) {
      expect(screen.getAllByText(chip).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getByText("not configured")).toBeInTheDocument();
    expect(screen.getByText("overlap")).toBeInTheDocument();
  });

  it("keeps the costs chip a warn item when costs are absent", () => {
    const report = sampleReport();
    render(<ConfigChips report={report} idPrefix="t2" />);
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
  });
});
