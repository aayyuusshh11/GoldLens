import { describe, expect, it } from "vitest";
import { SAMPLE_REPORT, SAMPLE_REPORT_LABEL, samplePreviewSummary } from "./sample";
import { isDiagnosticsOnly, withheldNetReasons } from "@/lib/report/analysis";

describe("sample report loader — honesty invariants", () => {
  it("loads the supplied example as a typed report", () => {
    expect(SAMPLE_REPORT.pair.symbol).toBeTypeOf("string");
    expect(SAMPLE_REPORT.config.exec_mode).toBe("next_close");
  });

  it("is explicitly the one-day diagnostics report from the handoff", () => {
    expect(SAMPLE_REPORT.data_provenance.trading_days).toBe(1);
    expect(SAMPLE_REPORT.data_provenance.date_range).toEqual(["2026-10-16", "2026-10-16"]);
    expect(SAMPLE_REPORT.is_valid_backtest).toBe(false);
    expect(samplePreviewSummary()).toContain("NOT A VALID BACKTEST");
  });

  it("has diagnostics-only metrics with withheld net values (null, not zero)", () => {
    expect(SAMPLE_REPORT.metrics?.status).toBe("diagnostics_only");
    expect(SAMPLE_REPORT.metrics?.n_trades).toBe(0);
    expect(SAMPLE_REPORT.metrics?.net_pnl_rupees).toBeNull();
    expect(SAMPLE_REPORT.metrics?.sharpe_ratio).toBeNull();
    expect(isDiagnosticsOnly(SAMPLE_REPORT)).toBe(true);
  });

  it("surfaces null z-scores and NO TRADE as insufficient history", () => {
    expect(SAMPLE_REPORT.z_score[0]?.z).toBeNull();
    expect(SAMPLE_REPORT.signals[0]?.signal).toBe("NO TRADE");
    expect(SAMPLE_REPORT.signals[0]?.rationale).toContain("insufficient history");
  });

  it("has zero trades and a mandatory sample label", () => {
    expect(SAMPLE_REPORT.trades).toEqual([]);
    expect(SAMPLE_REPORT_LABEL).toMatch(/not live data/i);
    expect(SAMPLE_REPORT_LABEL).toMatch(/one trading day/i);
    expect(SAMPLE_REPORT_LABEL).toMatch(/not a valid backtest/i);
  });

  it("reports withheld-net reasons verbatim from backend notes", () => {
    const reasons = withheldNetReasons(SAMPLE_REPORT.metrics ?? null);
    expect(reasons.length).toBeGreaterThanOrEqual(2);
    expect(reasons.some((r) => r.includes("costs not configured"))).toBe(true);
    expect(reasons).toContain("costs_not_configured");
  });
});
