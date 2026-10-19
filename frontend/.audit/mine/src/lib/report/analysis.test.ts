import { describe, expect, it } from "vitest";
import {
  countStale,
  gapDaysCount,
  isDiagnosticsOnly,
  parseSpecChecks,
  withheldNetReasons,
} from "./analysis";
import type { BacktestReportDTO, SpreadPointDTO } from "@/lib/api/types";

const staleRow = (stale: boolean): SpreadPointDTO => ({
  trade_date: "2026-10-16",
  symbol: "GOLDM",
  near_expiry: "2026-12-04",
  far_expiry: "2027-01-05",
  near_close: 147866,
  far_close: 149227,
  spread: 1361,
  stale,
});

describe("report analysis adapter", () => {
  it("counts stale observations without smoothing them", () => {
    expect(countStale([])).toBe(0);
    expect(countStale([staleRow(false), staleRow(true), staleRow(true)])).toBe(2);
  });

  it("counts calendar gaps > 1 day (weekends/holidays) between sessions", () => {
    // Thu 15 → Fri 16 → Mon 19: one weekend gap.
    expect(gapDaysCount(["2026-10-16", "2026-10-15", "2026-10-19"])).toBe(1);
    expect(gapDaysCount(["2026-10-16"])).toBe(0);
    expect(gapDaysCount([])).toBe(0);
  });

  it("parses verbatim PASS/FAIL spec strings; unknown prefixes stay unparsed", () => {
    const parsed = parseSpecChecks([
      "PASS GOLD: spec value/lot Rs 15,319,350 -> PASS",
      "FAIL GOLDM: mismatch",
      "GARBAGE LINE",
      "",
    ]);
    expect(parsed[0]).toEqual({ ok: true, text: "GOLD: spec value/lot Rs 15,319,350 -> PASS" });
    expect(parsed[1]!.ok).toBe(false);
    expect(parsed[2]!.unparsed).toBe(true);
    expect(parsed[3]!.unparsed).toBe(true);
    expect(parseSpecChecks(undefined)).toEqual([]);
  });

  it("extracts backend-withheld reasons verbatim", () => {
    const metrics: BacktestReportDTO["metrics"] = {
      status: "diagnostics_only",
      n_days: 1,
      n_trades: 0,
      gross_pnl_rupees: 0,
      net_pnl_rupees: null,
      win_rate: null,
      max_drawdown_rupees: 0,
      net_max_drawdown_rupees: null,
      sharpe_ratio: null,
      net_sharpe_ratio: null,
      total_cost_rupees: null,
      avg_pnl_per_trade: null,
      notes: ["Net P&L withheld: costs not configured (config.costs is None).", "costs_not_configured"],
      costs_assumption: "not supplied — net metrics withheld",
    };
    const reasons = withheldNetReasons(metrics);
    expect(reasons).toHaveLength(2);
    expect(reasons.some((r) => r.startsWith("Net P&L withheld"))).toBe(true);
  });

  it("keeps diagnostics_only reports diagnostics-only in every path", () => {
    const partial = { metrics: null, is_valid_backtest: false } as BacktestReportDTO;
    expect(isDiagnosticsOnly(partial)).toBe(true);
    expect(
      isDiagnosticsOnly({ ...partial, metrics: { status: "backtest" } as BacktestReportDTO["metrics"] }),
    ).toBe(false);
  });
});
