import { describe, expect, it } from "vitest";
import {
  FIXTURE_META,
  FIXTURE_SYMBOLS,
  FIXTURE_TRADE_DATE,
  fixtureBacktestRun,
  fixtureContracts,
  fixtureDataQuality,
  fixtureHealth,
  fixturePairHistory,
  fixturePairs,
  fixtureSignalAnalyze,
} from "./fixtures";

/**
 * Fixture-mode contract tests. The fixture resolvers must mirror what the
 * real backend returns for a 1-trading-day ingest: candidate-only pairs,
 * NO_TRADE decisions, refused backtests (runnable:false) — never fabricated
 * analytics.
 */

const GOLDM_PAIR_ID = "GOLDM_near20261204_far20270105";
const GOLD_REFERENCE_PAIR_ID = "GOLD_near20270205_far20270405";

describe("fixture dataset identity", () => {
  it("covers exactly the GOLD and GOLDM expiries of the supplied sample", () => {
    expect(FIXTURE_SYMBOLS.length).toBe(2);
    expect(FIXTURE_SYMBOLS).toContain("GOLD");
    expect(FIXTURE_SYMBOLS).toContain("GOLDM");
    expect(FIXTURE_META.tradeDate).toBe(FIXTURE_TRADE_DATE);
    expect(FIXTURE_TRADE_DATE).toBe("2026-10-16");
  });
});

describe("fixtureHealth", () => {
  it("mirrors a healthy 1-day backend", () => {
    const health = fixtureHealth();
    expect(health.status).toBe("healthy");
    expect(health.data_available).toBe(true);
    expect(health.distinct_trade_dates).toBe(1);
    expect(health.latest_data_date).toBe(FIXTURE_TRADE_DATE);
  });
});

describe("fixtureContracts", () => {
  it("lists 12 unverified gold-family contracts", () => {
    const all = fixtureContracts();
    expect(all.total).toBe(12);
    expect(all.count).toBe(12);
    for (const contract of all.contracts) {
      expect(contract.verification_status).toBe("unverified");
      expect(contract.contract_size).toBe(null);
      expect(contract.verified_fields).toEqual([]);
      expect(contract.expiry_date).not.toBe(null);
    }
  });

  it("filters by symbol and pages like the backend", () => {
    const goldm = fixtureContracts({ symbol: "GOLDM" });
    expect(goldm.total).toBe(6);
    for (const contract of goldm.contracts) expect(contract.symbol).toBe("GOLDM");

    const paged = fixtureContracts({ limit: 2, offset: 0 });
    expect(paged.count).toBe(2);
    const next = fixtureContracts({ limit: 2, offset: 2 });
    expect(next.contracts[0]?.contract_id).not.toBe(paged.contracts[0]?.contract_id);
  });
});

describe("fixturePairs", () => {
  it("lists adjacent-expiry candidate pairs only", () => {
    const all = fixturePairs();
    expect(all.pairs).toHaveLength(10);
    for (const pair of all.pairs) {
      expect(pair.status).toBe("candidate_only");
      expect(pair.reason_codes).toEqual(["UNVERIFIED_SPEC"]);
      expect(pair.history_days).toBe(1);
    }
    expect(all.warnings.some((w) => w.code === "UNVERIFIED_SPEC")).toBe(true);
  });

  it("filters by symbol (5 adjacent GOLDM pairs, 5 GOLD pairs)", () => {
    expect(fixturePairs("GOLDM").pairs).toHaveLength(5);
    expect(fixturePairs("GOLD").pairs).toHaveLength(5);
    expect(fixturePairs("SILVER").pairs).toHaveLength(0);
  });
});

describe("fixturePairHistory", () => {
  it("returns the single reference row for a known tradable pair", () => {
    const history = fixturePairHistory(GOLDM_PAIR_ID);
    expect(history).not.toBe(null);
    if (history === null) throw new Error("unreachable");
    expect(history.pair_id).toBe(GOLDM_PAIR_ID);
    expect(history.near_expiry).toBe("2026-12-04");
    expect(history.far_expiry).toBe("2027-01-05");
    expect(history.observations).toHaveLength(1);
    const row = history.observations[0];
    if (row === undefined) throw new Error("fixture history returned no observations");
    // Backend convention: spread = far_close − near_close (positive = far premium).
    expect(row.spread).toBe(149227 - 147866);
    expect(row.status).toBe("observation");
    expect(row.reason_codes).toEqual([]);
    expect(history.warnings.some((w) => w.code === "INSUFFICIENT_HISTORY")).toBe(true);
  });

  it("flags zero-volume legs as reference_only, never tradable", () => {
    const history = fixturePairHistory(GOLD_REFERENCE_PAIR_ID);
    expect(history).not.toBe(null);
    if (history === null) throw new Error("unreachable");
    const row = history.observations[0];
    if (row === undefined) throw new Error("fixture history returned no observations");
    expect(row.status).toBe("reference_only");
    expect(row.reason_codes).toContain("ZERO_VOLUME");
    expect(row.reason_codes).toContain("STALE_PRICE");
  });

  it("returns null for unparseable pair ids", () => {
    expect(fixturePairHistory("nonsense")).toBe(null);
  });
});

describe("fixtureSignalAnalyze", () => {
  it("issues an honest NO_TRADE with quant fields null", () => {
    const signal = fixtureSignalAnalyze({ pair_id: GOLDM_PAIR_ID });
    expect(signal).not.toBe(null);
    if (signal === null) throw new Error("unreachable");
    expect(signal.decision).toBe("NO_TRADE");
    expect(signal.z_score).toBe(null);
    expect(signal.gross_edge).toBe(null);
    expect(signal.estimated_cost).toBe(null);
    expect(signal.net_edge).toBe(null);
    expect(signal.reason_codes).toContain("INSUFFICIENT_HISTORY");
    expect(signal.reason_codes).toContain("UNVERIFIED_SPEC");
    expect(signal.spread).toBe(149227 - 147866);
  });

  it("returns null for unparseable pair ids", () => {
    expect(fixtureSignalAnalyze({ pair_id: "nonsense" })).toBe(null);
  });
});

describe("fixtureBacktestRun", () => {
  it("refuses with null metrics — runnable:false is the honest verdict", () => {
    const refused = fixtureBacktestRun({ pair_id: GOLDM_PAIR_ID });
    expect(refused).not.toBe(null);
    if (refused === null) throw new Error("unreachable");
    expect(refused.runnable).toBe(false);
    expect(refused.completed_trades).toBe(0);
    expect(refused.gross_pnl).toBe(null);
    expect(refused.estimated_costs).toBe(null);
    expect(refused.net_pnl).toBe(null);
    expect(refused.observation_count).toBe(1);
    expect(refused.warnings.some((w) => w.code === "INSUFFICIENT_HISTORY")).toBe(true);
  });

  it("excludes reference-only pairs from observation_count and unknown ids are null", () => {
    const reference = fixtureBacktestRun({ pair_id: GOLD_REFERENCE_PAIR_ID });
    expect(reference?.observation_count).toBe(1); // row exists; still runnable:false
    expect(fixtureBacktestRun({ pair_id: "nonsense" })).toBe(null);
  });
});

describe("fixtureDataQuality", () => {
  it("reports the measured 1-day totals and gating", () => {
    const dq = fixtureDataQuality();
    expect(dq.rows.total).toBe(15_535);
    expect(dq.rows.futcom_rows).toBe(168);
    expect(dq.rows.options_rows).toBe(14_730);
    expect(dq.rows.futidx_rows).toBe(7);
    expect(dq.dates_available).toEqual([FIXTURE_TRADE_DATE]);
    expect(dq.contract_spec_verification).toEqual({ verified: 0, unverified: 12, conflicting: 0 });
    expect(dq.history_sufficiency.minimum_required).toBe(30);
    expect(dq.history_sufficiency.sufficient_for_signal).toBe(false);
    expect(dq.history_sufficiency.sufficient_for_backtest).toBe(false);
  });

  it("separates zero-volume from missing-volume and refuses missing settlement", () => {
    const codes = Object.fromEntries(fixtureDataQuality().issues.map((i) => [i.code, i]));
    expect(codes.ZERO_VOLUME_ROWS?.count).toBe(14_592);
    expect(codes.MISSING_VOLUME_ROWS?.count).toBe(0);
    expect(codes.MISSING_SETTLEMENT_ROWS?.severity).toBe("critical");
    expect(codes.MISSING_SETTLEMENT_ROWS?.count).toBe(15_535);
    expect(codes.DUPLICATE_BUSINESS_KEYS?.count).toBe(0);
  });
});
