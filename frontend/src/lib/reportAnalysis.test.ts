import { describe, expect, it } from "vitest";
import type { EligibleContractDTO, MetricsDTO, SignalDTO, SpreadObservationDTO } from "../types/api";
import { fixtureJson, sampleReport } from "../test/helpers";
import {
  VALIDITY_GATE_MIN_OBSERVATIONS,
  costsNotConfigured,
  countStale,
  dateRangeLabel,
  eligibleCounts,
  gapDaysCount,
  hasAnyNonNullZ,
  last,
  latestSignal,
  metricsStatusLabel,
  netWithheldReason,
  parseSpecChecks,
  signalLabelCounts,
} from "./reportAnalysis";

const sample = sampleReport();

describe("costs / net withholding logic", () => {
  it("flags unconfigured costs on the bundled sample", () => {
    expect(costsNotConfigured(sample)).toBe(true);
    expect([null, "not configured (gross-only)", ""].includes(sample.config.costs)).toBe(true);
  });

  it("treats null, empty and 'not configured' strings uniformly", () => {
    const base = { ...sample, config: { ...sample.config, costs: null } };
    expect(costsNotConfigured(base)).toBe(true);
    const empty = { ...sample, config: { ...sample.config, costs: "" } };
    expect(costsNotConfigured(empty)).toBe(true);
    const phrase = { ...sample, config: { ...sample.config, costs: "not configured (gross-only)" } };
    expect(costsNotConfigured(phrase)).toBe(true);
    const configured = { ...sample, config: { ...sample.config, costs: "flat ₹120 per lot" } };
    expect(costsNotConfigured(configured)).toBe(false);
  });

  it("gives a withholding reason for the sample even though gross metrics exist", () => {
    expect(netWithheldReason(sample, sample.metrics)).toMatch(/withheld/i);
  });

  it("does not withhold net metrics when costs are configured and present", () => {
    const configured = {
      ...sample,
      config: { ...sample.config, costs: "flat ₹120 per lot" },
      metrics: { ...(sample.metrics as MetricsDTO), net_pnl_rupees: -240 },
    };
    expect(netWithheldReason(configured, configured.metrics)).toBeNull();
  });

  it("flags net withheld when costs look configured but net is null with trades", () => {
    const weird = {
      ...sample,
      config: { ...sample.config, costs: "flat ₹120" },
      metrics: { ...(sample.metrics as MetricsDTO), n_trades: 3, net_pnl_rupees: null },
    };
    expect(netWithheldReason(weird, weird.metrics)).toMatch(/metrics\.notes/);
  });
});

describe("provenance helpers", () => {
  it("parses spec check outcomes", () => {
    expect(parseSpecChecks(["PASS check-one", "FAIL check-two"])).toEqual([
      { text: "PASS check-one", ok: true },
      { text: "FAIL check-two", ok: false },
    ]);
  });

  it("counts stale observations", () => {
    const stale: SpreadObservationDTO[] = [
      { trade_date: "2026-10-15", symbol: "GOLDM", near_expiry: "2026-12-04", far_expiry: "2027-01-05", near_close: 1, far_close: 2, spread: 1, stale: true },
      { trade_date: "2026-10-16", symbol: "GOLDM", near_expiry: "2026-12-04", far_expiry: "2027-01-05", near_close: 3, far_close: 4, spread: 1, stale: false },
    ];
    expect(countStale(stale)).toBe(1);
  });

  it("ranges labels for one or many sessions", () => {
    expect(dateRangeLabel([])).toBe("Not available");
    expect(dateRangeLabel(["2026-10-16"])).toMatch(/single session/);
    expect(dateRangeLabel(["2026-10-16", "2026-10-17"])).toBe("16 Oct 2026 — 17 Oct 2026");
  });

  it("counts calendar gaps > 1 trading-off day", () => {
    expect(gapDaysCount(["2026-10-15", "2026-10-16", "2026-10-17"])).toBe(0);
    expect(gapDaysCount(["2026-10-16", "2026-10-20"])).toBe(1);
    expect(gapDaysCount(["garbage", "2026-10-20"])).toBe(0);
  });
});

describe("eligibility helpers", () => {
  it("keeps eligible/rejected/verified consistent over synthetic rows", () => {
    const mk = (over: Partial<EligibleContractDTO>): EligibleContractDTO => ({
      trade_date: "2026-10-16",
      symbol: "GOLDM",
      expiry: "2026-12-04",
      days_to_expiry: 49,
      close: 1000,
      volume_lots: 1,
      open_interest_lots: 1,
      value_lakhs: 1,
      eligible: false,
      reason: null,
      lot_size_g: 995,
      quote_basis_g: 995,
      ...over,
    });
    const contracts = [
      mk({ eligible: true, reason: null }),
      mk({ eligible: false, reason: "vol<500", lot_size_g: null, quote_basis_g: null }),
      mk({ eligible: true, reason: "" }),
    ];
    const counts = eligibleCounts(contracts);
    expect(counts.eligible).toBe(2);
    expect(counts.rejected).toBe(1);
    expect(counts.verifiedSpec).toBe(2);
  });
});

describe("signal helpers", () => {
  it("labels metrics status safely", () => {
    expect(metricsStatusLabel(null)).toMatch(/No metrics block/);
    expect(metricsStatusLabel({ ...(sample.metrics as MetricsDTO), status: "diagnostics_only" })).toBe("Diagnostics only");
    expect(metricsStatusLabel({ ...(sample.metrics as MetricsDTO), status: "backtest" })).toBe("Backtest");
    expect(metricsStatusLabel({ ...(sample.metrics as MetricsDTO), status: "weird_status" })).toBe("Status: weird_status");
  });

  it("finds the latest signal and counts labels", () => {
    const signals = sample.signals;
    const latest = latestSignal(signals);
    expect(latest).toBeDefined();
    expect(signalLabelCounts(signals).reduce((sum, e) => sum + e.count, 0)).toBe(signals.length);

    const synth: SignalDTO[] = [
      { trade_date: "2026-10-15", signal: "LONG", z: 2.2, spread: 1000, mean: 900, std: 50, filters_ok: true, filter_reason: "", position_before: "flat", rationale: "x", no_trade_reason: null },
      { trade_date: "2026-10-16", signal: "LONG", z: 2.5, spread: 1100, mean: 900, std: 50, filters_ok: true, filter_reason: "", position_before: "long", rationale: "x", no_trade_reason: null },
    ];
    expect(signalLabelCounts(synth)).toEqual([{ label: "LONG", count: 2 }]);
  });

  it("detects any non-null z", () => {
    expect(hasAnyNonNullZ([{ trade_date: "d", spread: 1, rolling_mean: null, rolling_std: null, z: null }])).toBe(false);
    expect(hasAnyNonNullZ([{ trade_date: "d", spread: 1, rolling_mean: 1, rolling_std: 1, z: 0 }])).toBe(true);
  });

  it("returns undefined from last() on empty arrays", () => {
    expect(last<number>([])).toBeUndefined();
    expect(last<number>([1, 2])).toBe(2);
  });
});

describe("sample-derived invariants", () => {
  it("documents the validity gate constant", () => {
    expect(VALIDITY_GATE_MIN_OBSERVATIONS).toBe(30);
  });

  it("sample fixture parses (import of JSON works in tests)", () => {
    expect(fixtureJson).toBeTruthy();
    expect(sample.spread_observations.length).toBeGreaterThan(0);
  });
});
