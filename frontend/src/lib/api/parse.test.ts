import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./errors";
import { fixtureJson, sampleReport } from "../../test/helpers";
import { parseBacktestReport, parseHealth } from "./parse";

describe("parseBacktestReport with the bundled API contract sample", () => {
  it("parses the full sample into a typed report", () => {
    const report = sampleReport();

    expect(report.pair.symbol).toBe("GOLDM");
    expect(report.pair.near_expiry).toBe("2026-12-04");
    expect(report.pair.far_expiry).toBe("2027-01-05");

    const first = report.spread_observations[0];
    expect(first).toBeDefined();
    expect(first?.trade_date).toBe("2026-10-16");
    expect(first?.near_close).toBe(147866); // sample: GOLDM near close
    expect(first?.far_close).toBe(149227); // sample: GOLDM far close
    expect(first?.spread).toBe(1361); // far − near, per pipeline

    expect(report.is_valid_backtest).toBe(false);
    expect(report.verdict).toMatch(/NOT A VALID BACKTEST/);
  });

  it("preserves nulls — never coerces to zero", () => {
    const report = sampleReport();
    expect(report.metrics).not.toBeNull();
    expect(report.metrics?.net_pnl_rupees).toBeNull();
    expect(report.metrics?.win_rate).toBeNull();
    expect(report.metrics?.sharpe_ratio).toBeNull();
    expect(report.metrics?.gross_pnl_rupees).toBe(0); // explicit zero stays zero
    expect(report.metrics?.n_trades).toBe(0);

    const zPoint = report.z_score[0];
    expect(zPoint).toBeDefined();
    expect(zPoint?.z).toBeNull();
    expect(zPoint?.rolling_mean).toBeNull();
    expect(zPoint?.rolling_std).toBeNull();

    expect(report.signals[0]?.z).toBeNull();
    expect(report.signals[0]?.mean).toBeNull();
    expect(report.signals[0]?.std).toBeNull();
    expect(report.signals[0]?.signal).toBe("NO TRADE");

    expect(report.train_metrics).toBeNull();
    expect(report.test_metrics).toBeNull();
    expect(report.walk_forward_cmp).toEqual([]);
  });

  it("exposes diagnostics-only status and the costs assumption verbatim", () => {
    const report = sampleReport();
    expect(report.metrics?.status).toBe("diagnostics_only");
    expect(typeof report.metrics?.costs_assumption === "string" || report.metrics?.costs_assumption === null).toBe(true);
  });

  it("keeps the eligibility snapshot intact", () => {
    const report = sampleReport();
    const eligible = report.eligible_contracts.filter((c) => c.eligible);
    const rejected = report.eligible_contracts.filter((c) => !c.eligible);
    expect(eligible.length).toBeGreaterThan(0);
    expect(rejected.length).toBeGreaterThan(0);
  });
});

describe("parseBacktestReport contract enforcement", () => {
  it("rejects a non-object payload", () => {
    expect(() => parseBacktestReport([1, 2, 3])).toThrowError(ApiRequestError);
    expect(() => parseBacktestReport(null)).toThrowError(/object/);
  });

  it("rejects a missing top-level key naming the path", () => {
    const raw = { ...(fixtureJson as unknown as Record<string, unknown>) };
    delete raw.verdict;
    try {
      parseBacktestReport(raw);
      expect.unreachable("expected schema error");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      const appError = (error as ApiRequestError).appError;
      expect(appError.kind).toBe("schema");
      expect(appError.message).toContain("report.verdict");
    }
  });

  it("rejects wrong-typed nested fields", () => {
    const raw = { ...(fixtureJson as unknown as Record<string, unknown>) };
    raw.config = { ...(raw.config as Record<string, unknown>), lookback_days: "thirty" };
    expect(() => parseBacktestReport(raw)).toThrowError(/lookback_days/);
  });

  it("accepts explicit nulls for nullable segments", () => {
    const raw = { ...(fixtureJson as unknown as Record<string, unknown>), metrics: null };
    const report = parseBacktestReport(raw);
    expect(report.metrics).toBeNull();
  });
});

describe("parseHealth", () => {
  it("reads the documented health shape", () => {
    const health = parseHealth({ status: "ok", service: "goldlens-api", quant_module: "loaded" });
    expect(health).toEqual({ status: "ok", service: "goldlens-api", quant_module: "loaded" });
  });

  it("rejects incomplete health payloads", () => {
    expect(() => parseHealth({ status: "ok" })).toThrowError(ApiRequestError);
  });
});
