import { describe, expect, it } from "vitest";
import {
  parseBacktestRun,
  parseContractsResponse,
  parseDataQualityReport,
  parseHealth,
  parsePairHistory,
  parsePairsResponse,
  parseSignalAnalyze,
} from "./parse";
import { ApiRequestError } from "./errors";
import {
  fixtureBacktestRun,
  fixtureContracts,
  fixtureDataQuality,
  fixtureHealth,
  fixturePairHistory,
  fixturePairs,
  fixtureSignalAnalyze,
} from "./fixtures";

/**
 * Contract tests: one happy path per endpoint (1:1 with
 * backend/app/schemas/api_models.py), drift-failure cases, and a round-trip
 * suit that proves the bundled fixtures satisfy the exact same validators as
 * live responses.
 */

const GOLDM_PAIR_ID = "GOLDM_near20261204_far20270105";

function expectSchemaError(fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    if (error instanceof ApiRequestError) {
      expect(error.appError.kind).toBe("schema");
      return;
    }
  }
  throw new Error("expected parser to throw a schema error");
}

describe("parseHealth", () => {
  it("accepts the settled shape and preserves fields verbatim", () => {
    const dto = parseHealth({
      status: "healthy",
      service: "goldlens-backend",
      version: "0.1.0",
      data_available: true,
      distinct_trade_dates: 1,
      latest_data_date: "2026-10-16",
      extra_ignored: true,
    });
    expect(dto).toEqual({
      status: "healthy",
      service: "goldlens-backend",
      version: "0.1.0",
      data_available: true,
      distinct_trade_dates: 1,
      latest_data_date: "2026-10-16",
    });
  });

  it("rejects missing fields, wrong types and fractional counts", () => {
    const full = {
      status: "healthy",
      service: "goldlens-backend",
      version: "0.1.0",
      data_available: true,
      distinct_trade_dates: 1,
      latest_data_date: null,
    };
    expectSchemaError(() => parseHealth({ ...full, distinct_trade_dates: undefined }));
    expectSchemaError(() => parseHealth({ ...full, distinct_trade_dates: "1" }));
    expectSchemaError(() => parseHealth({ ...full, distinct_trade_dates: 1.5 }));
    expectSchemaError(() => parseHealth({ ...full, data_available: "yes" }));
    expectSchemaError(() => parseHealth("not an object"));
  });
});

describe("parseContractsResponse", () => {
  const contract = {
    contract_id: "FUTCOM_GOLDM_20261204",
    symbol: "GOLDM",
    instrument_type: "FUTCOM",
    expiry_date: "2026-12-04",
    contract_size: null,
    units: null,
    quotation_unit: null,
    purity: null,
    tick_size: null,
    expiry_rule: null,
    verification_status: "unverified",
    verified_fields: [],
    source: null,
    verification_timestamp: null,
    effective_from: null,
    effective_to: null,
    first_observed_date: "2026-10-16",
    last_observed_date: "2026-10-16",
    updated_at: null,
  };

  it("accepts nulls for every unverified spec field", () => {
    const dto = parseContractsResponse({ total: 1, count: 1, offset: 0, contracts: [contract] });
    expect(dto.total).toBe(1);
    const first = dto.contracts[0];
    expect(first).toBeDefined();
    expect(first?.verification_status).toBe("unverified");
    expect(first?.contract_size).toBe(null);
  });

  it("rejects missing required fields and non-array listings", () => {
    const broken = { ...contract, contract_id: undefined };
    expectSchemaError(() =>
      parseContractsResponse({ total: 1, count: 1, offset: 0, contracts: [broken] }),
    );
    expectSchemaError(() =>
      parseContractsResponse({ total: 1, count: 1, offset: 0, contracts: "none" }),
    );
    expectSchemaError(() => parseContractsResponse({ total: 1, contracts: [] }));
  });
});

describe("parsePairsResponse", () => {
  it("accepts candidate pairs with warnings", () => {
    const dto = parsePairsResponse({
      pairs: [
        {
          pair_id: GOLDM_PAIR_ID,
          symbol: "GOLDM",
          near: { contract_id: "FUTCOM_GOLDM_20261204", expiry_date: "2026-12-04" },
          far: { contract_id: "FUTCOM_GOLDM_20270105", expiry_date: "2027-01-05" },
          status: "candidate_only",
          reason_codes: ["UNVERIFIED_SPEC"],
          history_days: 1,
        },
      ],
      warnings: [{ code: "UNVERIFIED_SPEC", severity: "warning", count: 12, message: "…" }],
    });
    expect(dto.pairs).toHaveLength(1);
    expect(dto.pairs[0]?.far.expiry_date).toBe("2027-01-05");
    expect(dto.warnings[0]?.severity).toBe("warning");
  });

  it("rejects a pair whose legs are missing", () => {
    expectSchemaError(() =>
      parsePairsResponse({
        pairs: [{ pair_id: GOLDM_PAIR_ID, symbol: "GOLDM", status: "candidate_only", reason_codes: [], history_days: 1 }],
        warnings: [],
      }),
    );
  });
});

describe("parsePairHistory", () => {
  it("accepts observations with nullable prices", () => {
    const dto = parsePairHistory({
      pair_id: GOLDM_PAIR_ID,
      symbol: "GOLDM",
      near_expiry: "2026-12-04",
      far_expiry: "2027-01-05",
      observations: [
        {
          trade_date: "2026-10-16",
          near_close: 147866,
          far_close: 149227,
          spread: -1361,
          status: "observation",
          reason_codes: [],
        },
      ],
      count: 1,
      warnings: [{ code: "INSUFFICIENT_HISTORY", severity: "warning", count: 1, message: "…" }],
    });
    expect(dto.observations[0]?.spread).toBe(-1361);
  });

  it("rejects non-integer count or a malformed warning", () => {
    const base = {
      pair_id: GOLDM_PAIR_ID,
      symbol: "GOLDM",
      near_expiry: "2026-12-04",
      far_expiry: "2027-01-05",
      observations: [],
      warnings: [],
    };
    expectSchemaError(() => parsePairHistory({ ...base, count: 1.2 }));
    expectSchemaError(() =>
      parsePairHistory({ ...base, count: 0, warnings: [{ code: 1, severity: "warning", count: 1, message: "m" }] }),
    );
  });
});

describe("parseSignalAnalyze", () => {
  it("accepts the decision shape with quant fields null", () => {
    const dto = parseSignalAnalyze({
      pair_id: GOLDM_PAIR_ID,
      as_of_date: "2026-10-16",
      decision: "NO_TRADE",
      reason_codes: ["INSUFFICIENT_HISTORY", "UNVERIFIED_SPEC"],
      spread: -1361,
      z_score: null,
      gross_edge: null,
      estimated_cost: null,
      net_edge: null,
      data_quality: {
        distinct_trade_dates: 1,
        latest_data_date: "2026-10-16",
        trading_days_available: 1,
        warnings: [{ code: "INSUFFICIENT_HISTORY", severity: "error", count: 1, message: "…" }],
      },
      notes: "upstream explains nulls",
    });
    expect(dto.decision).toBe("NO_TRADE");
    expect(dto.z_score).toBe(null);
    expect(dto.data_quality.trading_days_available).toBe(1);
  });

  it("rejects a missing data_quality block", () => {
    const base = {
      pair_id: GOLDM_PAIR_ID,
      as_of_date: "2026-10-16",
      decision: "NO_TRADE",
      reason_codes: [],
      spread: null,
      z_score: null,
      gross_edge: null,
      estimated_cost: null,
      net_edge: null,
      notes: null,
    };
    expectSchemaError(() => parseSignalAnalyze(base));
  });
});

describe("parseBacktestRun", () => {
  const runnableFalse = {
    run_id: "bt_1",
    pair_id: GOLDM_PAIR_ID,
    strategy_version: "default",
    evaluation_period: { start_date: null, end_date: "2026-10-16" },
    observation_count: 1,
    completed_trades: 0,
    gross_pnl: null,
    estimated_costs: null,
    net_pnl: null,
    max_drawdown: null,
    assumptions: [],
    warnings: [{ code: "INSUFFICIENT_HISTORY", severity: "error", count: 1, message: "refused" }],
    runnable: false,
  };

  it("accepts a refused backtest with null metrics", () => {
    const dto = parseBacktestRun(runnableFalse);
    expect(dto.runnable).toBe(false);
    expect(dto.gross_pnl).toBe(null);
    expect(dto.warnings[0]?.code).toBe("INSUFFICIENT_HISTORY");
  });

  it("rejects unknown runnable type", () => {
    expectSchemaError(() => parseBacktestRun({ ...runnableFalse, runnable: "false" }));
    expectSchemaError(() => parseBacktestRun({ ...runnableFalse, evaluation_period: null }));
  });
});

describe("parseDataQualityReport", () => {
  it("accepts sources/rows/issues/verification/sufficiency", () => {
    const dto = parseDataQualityReport({
      generated_at: "2026-10-20T10:30:00Z",
      sources: [
        {
          file: "BhavCopyDateWise_16102026 (2).csv",
          ingested_at: "2026-10-20T10:05:12Z",
          input_rows: 15535,
          accepted_rows: 15535,
          rejected_rows: 0,
          observations_inserted: 15535,
          observations_skipped: 0,
          status: "ingested",
        },
      ],
      rows: { total: 15535, futcom_rows: 168, options_rows: 14730, futidx_rows: 7, rejected_rows: 0 },
      dates_available: ["2026-10-16"],
      issues: [{ code: "ZERO_VOLUME_ROWS", severity: "warning", count: 14592, message: "…" }],
      contract_spec_verification: { verified: 0, unverified: 12, conflicting: 0 },
      history_sufficiency: {
        distinct_trade_dates: 1,
        minimum_required: 30,
        sufficient_for_signal: false,
        sufficient_for_backtest: false,
      },
    });
    expect(dto.rows.futcom_rows).toBe(168);
    expect(dto.issues[0]?.count).toBe(14592);
    expect(dto.history_sufficiency.distinct_trade_dates).toBe(1);
  });

  it("rejects a missing dates list", () => {
    expectSchemaError(() =>
      parseDataQualityReport({
        generated_at: "t",
        sources: [],
        rows: { total: 0, futcom_rows: 0, options_rows: 0, futidx_rows: 0, rejected_rows: 0 },
        issues: [],
        contract_spec_verification: { verified: 0, unverified: 0, conflicting: 0 },
        history_sufficiency: {
          distinct_trade_dates: 0,
          minimum_required: 30,
          sufficient_for_signal: false,
          sufficient_for_backtest: false,
        },
      }),
    );
  });
});

describe("fixtures satisfy the same validators as live responses", () => {
  it("health / contracts / pairs / history / signal / backtest round-trip", () => {
    const pairs = parsePairsResponse(fixturePairs());
    expect(pairs.pairs.length).toBeGreaterThan(0);

    const firstPair = pairs.pairs[0];
    if (firstPair === undefined) throw new Error("fixture produced no pairs");
    const pairId = firstPair.pair_id;
    parsePairHistory(fixturePairHistory(pairId) as object);
    parseSignalAnalyze(fixtureSignalAnalyze({ pair_id: pairId }) as object);
    parseBacktestRun(fixtureBacktestRun({ pair_id: pairId }) as object);

    expect(parseContractsResponse(fixtureContracts()).total).toBe(12);
    expect(parseHealth(fixtureHealth()).distinct_trade_dates).toBe(1);
  });

  it("data quality round-trips with the documented totals", () => {
    const dto = parseDataQualityReport(fixtureDataQuality());
    expect(dto.rows.total).toBe(15_535);
    expect(dto.rows.futcom_rows).toBe(168);
    expect(dto.rows.options_rows).toBe(14_730);
    expect(dto.rows.futidx_rows).toBe(7);
    expect(dto.contract_spec_verification.unverified).toBe(12);
    expect(dto.history_sufficiency.sufficient_for_backtest).toBe(false);
  });
});

describe("parse rejects fabricated-looking bodies", () => {
  it("fractional counts on every root", () => {
    expectSchemaError(() =>
      parseContractsResponse({ total: 2.5, count: 0, offset: 0, contracts: [] }),
    );
    expectSchemaError(() =>
      parsePairsResponse({
        pairs: [
          {
            pair_id: GOLDM_PAIR_ID,
            symbol: "GOLDM",
            near: { contract_id: "c1", expiry_date: "2026-12-04" },
            far: { contract_id: "c2", expiry_date: "2027-01-05" },
            status: "candidate_only",
            reason_codes: [],
            history_days: 1.5,
          },
        ],
        warnings: [],
      }),
    );
  });
});
