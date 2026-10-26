import type {
  BacktestRunDTO,
  ContractDTO,
  ContractsResponseDTO,
  DataQualityReportDTO,
  DqContractSpecVerificationDTO,
  DqHistorySufficiencyDTO,
  DqRowsTotalsDTO,
  DqSourceStatusDTO,
  HealthDTO,
  PairHistoryDTO,
  PairLegDTO,
  PairSummaryDTO,
  PairsResponseDTO,
  SignalAnalyzeDTO,
  SignalDataQualityBlockDTO,
  SpreadObservationDTO,
  WarningItemDTO,
} from "../../types/api";
import { ApiRequestError } from "./errors";

/**
 * Runtime normalizers: unknown → DTO, or ApiRequestError(kind "schema").
 *
 * Guards the frontend against backend drift without fabricating values:
 * anything structurally required but missing/invalid raises a schema error
 * naming the path. Nullable fields may be null; null is never coerced to 0.
 * Extra unknown keys are ignored (forward compatibility).
 *
 * One parser per settled endpoint, 1:1 with backend/app/schemas/api_models.py
 * and schemas/data_quality.py (backend branch). Non-integer numbers (counts)
 * are rejected: an int serializes as int, drift = metadata loss.
 */

type Obj = Record<string, unknown>;

function fail(path: string, expectation: string): never {
  throw new ApiRequestError({
    kind: "schema",
    code: null,
    message: `Contract mismatch at "${path}": expected ${expectation}`,
    status: null,
    details: { path, expectation },
  });
}

function reqObj(value: unknown, path: string): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "object");
  return value as Obj;
}

function entry(container: Obj, key: string, parent: string): unknown {
  if (!(key in container)) fail(`${parent}.${key}`, "required field (missing)");
  return container[key];
}

function reqNum(container: Obj, key: string, parent: string): number {
  const v = entry(container, key, parent);
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${parent}.${key}`, "finite number");
  return v;
}

function reqInt(container: Obj, key: string, parent: string): number {
  const v = reqNum(container, key, parent);
  if (!Number.isInteger(v)) fail(`${parent}.${key}`, "integer");
  return v;
}

function optNum(container: Obj, key: string, parent: string): number | null {
  const v = entry(container, key, parent);
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${parent}.${key}`, "number or null");
  return v;
}

function reqStr(container: Obj, key: string, parent: string): string {
  const v = entry(container, key, parent);
  if (typeof v !== "string") fail(`${parent}.${key}`, "string");
  return v;
}

function optStr(container: Obj, key: string, parent: string): string | null {
  const v = entry(container, key, parent);
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") fail(`${parent}.${key}`, "string or null");
  return v;
}

function reqBool(container: Obj, key: string, parent: string): boolean {
  const v = entry(container, key, parent);
  if (typeof v !== "boolean") fail(`${parent}.${key}`, "boolean");
  return v;
}

function strArray(container: Obj, key: string, parent: string): string[] {
  const v = entry(container, key, parent);
  if (!Array.isArray(v)) fail(`${parent}.${key}`, "array");
  return v.map((item, i) => {
    if (typeof item !== "string") fail(`${parent}.${key}[${i}]`, "string");
    return item;
  });
}

/** Warning item {code, severity, count, message}. Unknown severities render safely. */
function parseWarningItem(raw: unknown, path: string): WarningItemDTO {
  const w = reqObj(raw, path);
  return {
    code: reqStr(w, "code", path),
    severity: reqStr(w, "severity", path),
    count: reqInt(w, "count", path),
    message: reqStr(w, "message", path),
  };
}

function parseWarningList(raw: unknown, path: string): WarningItemDTO[] {
  if (!Array.isArray(raw)) fail(path, "array");
  return raw.map((item, i) => parseWarningItem(item, `${path}[${i}]`));
}

// --------------------------------------------------------------------- //
// GET /api/health
// --------------------------------------------------------------------- //

export function parseHealth(raw: unknown): HealthDTO {
  const h = reqObj(raw, "health");
  return {
    status: reqStr(h, "status", "health"),
    service: reqStr(h, "service", "health"),
    version: reqStr(h, "version", "health"),
    data_available: reqBool(h, "data_available", "health"),
    distinct_trade_dates: reqInt(h, "distinct_trade_dates", "health"),
    latest_data_date: optStr(h, "latest_data_date", "health"),
  };
}

// --------------------------------------------------------------------- //
// GET /api/contracts
// --------------------------------------------------------------------- //

export function parseContract(raw: unknown, path: string): ContractDTO {
  const c = reqObj(raw, path);
  return {
    contract_id: reqStr(c, "contract_id", path),
    symbol: reqStr(c, "symbol", path),
    instrument_type: reqStr(c, "instrument_type", path),
    expiry_date: optStr(c, "expiry_date", path),
    contract_size: optNum(c, "contract_size", path),
    units: optStr(c, "units", path),
    quotation_unit: optStr(c, "quotation_unit", path),
    purity: optStr(c, "purity", path),
    tick_size: optNum(c, "tick_size", path),
    expiry_rule: optStr(c, "expiry_rule", path),
    verification_status: reqStr(c, "verification_status", path),
    verified_fields: strArray(c, "verified_fields", path),
    source: optStr(c, "source", path),
    verification_timestamp: optStr(c, "verification_timestamp", path),
    effective_from: optStr(c, "effective_from", path),
    effective_to: optStr(c, "effective_to", path),
    first_observed_date: optStr(c, "first_observed_date", path),
    last_observed_date: optStr(c, "last_observed_date", path),
    updated_at: optStr(c, "updated_at", path),
  };
}

export function parseContractsResponse(raw: unknown): ContractsResponseDTO {
  const r = reqObj(raw, "contracts");
  const list = entry(r, "contracts", "contracts");
  if (!Array.isArray(list)) fail("contracts.contracts", "array");
  return {
    total: reqInt(r, "total", "contracts"),
    count: reqInt(r, "count", "contracts"),
    offset: reqInt(r, "offset", "contracts"),
    contracts: list.map((item, i) => parseContract(item, `contracts.contracts[${i}]`)),
  };
}

// --------------------------------------------------------------------- //
// GET /api/pairs
// --------------------------------------------------------------------- //

export function parsePairLeg(raw: unknown, path: string): PairLegDTO {
  const l = reqObj(raw, path);
  return {
    contract_id: reqStr(l, "contract_id", path),
    expiry_date: reqStr(l, "expiry_date", path),
  };
}

export function parsePairSummary(raw: unknown, path: string): PairSummaryDTO {
  const p = reqObj(raw, path);
  return {
    pair_id: reqStr(p, "pair_id", path),
    symbol: reqStr(p, "symbol", path),
    near: parsePairLeg(p.near, `${path}.near`),
    far: parsePairLeg(p.far, `${path}.far`),
    status: reqStr(p, "status", path),
    reason_codes: strArray(p, "reason_codes", path),
    history_days: reqInt(p, "history_days", path),
  };
}

export function parsePairsResponse(raw: unknown): PairsResponseDTO {
  const r = reqObj(raw, "pairs");
  const list = entry(r, "pairs", "pairs");
  if (!Array.isArray(list)) fail("pairs.pairs", "array");
  return {
    pairs: list.map((item, i) => parsePairSummary(item, `pairs.pairs[${i}]`)),
    warnings: parseWarningList(r.warnings, "pairs.warnings"),
  };
}

// --------------------------------------------------------------------- //
// GET /api/pairs/{pair_id}/history
// --------------------------------------------------------------------- //

export function parseSpreadObservation(raw: unknown, path: string): SpreadObservationDTO {
  const o = reqObj(raw, path);
  return {
    trade_date: reqStr(o, "trade_date", path),
    near_close: optNum(o, "near_close", path),
    far_close: optNum(o, "far_close", path),
    spread: optNum(o, "spread", path),
    status: reqStr(o, "status", path),
    reason_codes: strArray(o, "reason_codes", path),
  };
}

export function parsePairHistory(raw: unknown): PairHistoryDTO {
  const h = reqObj(raw, "pair_history");
  const obs = entry(h, "observations", "pair_history");
  if (!Array.isArray(obs)) fail("pair_history.observations", "array");
  return {
    pair_id: reqStr(h, "pair_id", "pair_history"),
    symbol: reqStr(h, "symbol", "pair_history"),
    near_expiry: reqStr(h, "near_expiry", "pair_history"),
    far_expiry: reqStr(h, "far_expiry", "pair_history"),
    observations: obs.map((item, i) => parseSpreadObservation(item, `pair_history.observations[${i}]`)),
    count: reqInt(h, "count", "pair_history"),
    warnings: parseWarningList(h.warnings, "pair_history.warnings"),
  };
}

// --------------------------------------------------------------------- //
// POST /api/signals/analyze
// --------------------------------------------------------------------- //

export function parseSignalDataQualityBlock(raw: unknown, path: string): SignalDataQualityBlockDTO {
  const q = reqObj(raw, path);
  return {
    distinct_trade_dates: reqInt(q, "distinct_trade_dates", path),
    latest_data_date: optStr(q, "latest_data_date", path),
    trading_days_available: reqInt(q, "trading_days_available", path),
    warnings: parseWarningList(q.warnings, `${path}.warnings`),
  };
}

export function parseSignalAnalyze(raw: unknown): SignalAnalyzeDTO {
  const s = reqObj(raw, "signal");
  return {
    pair_id: reqStr(s, "pair_id", "signal"),
    as_of_date: reqStr(s, "as_of_date", "signal"),
    decision: reqStr(s, "decision", "signal"),
    reason_codes: strArray(s, "reason_codes", "signal"),
    spread: optNum(s, "spread", "signal"),
    z_score: optNum(s, "z_score", "signal"),
    gross_edge: optNum(s, "gross_edge", "signal"),
    estimated_cost: optNum(s, "estimated_cost", "signal"),
    net_edge: optNum(s, "net_edge", "signal"),
    data_quality: parseSignalDataQualityBlock(s.data_quality, "signal.data_quality"),
    notes: optStr(s, "notes", "signal"),
  };
}

// --------------------------------------------------------------------- //
// POST /api/backtests/run
// --------------------------------------------------------------------- //

export function parseBacktestRun(raw: unknown): BacktestRunDTO {
  const b = reqObj(raw, "backtest");
  const period = reqObj(b.evaluation_period, "backtest.evaluation_period");
  return {
    run_id: reqStr(b, "run_id", "backtest"),
    pair_id: reqStr(b, "pair_id", "backtest"),
    strategy_version: reqStr(b, "strategy_version", "backtest"),
    evaluation_period: {
      start_date: optStr(period, "start_date", "backtest.evaluation_period"),
      end_date: optStr(period, "end_date", "backtest.evaluation_period"),
    },
    observation_count: reqInt(b, "observation_count", "backtest"),
    completed_trades: reqInt(b, "completed_trades", "backtest"),
    gross_pnl: optNum(b, "gross_pnl", "backtest"),
    estimated_costs: optNum(b, "estimated_costs", "backtest"),
    net_pnl: optNum(b, "net_pnl", "backtest"),
    max_drawdown: optNum(b, "max_drawdown", "backtest"),
    assumptions: strArray(b, "assumptions", "backtest"),
    warnings: parseWarningList(b.warnings, "backtest.warnings"),
    runnable: reqBool(b, "runnable", "backtest"),
  };
}

// --------------------------------------------------------------------- //
// GET /api/data-quality
// --------------------------------------------------------------------- //

export function parseDqSourceStatus(raw: unknown, path: string): DqSourceStatusDTO {
  const s = reqObj(raw, path);
  return {
    file: reqStr(s, "file", path),
    ingested_at: reqStr(s, "ingested_at", path),
    input_rows: reqInt(s, "input_rows", path),
    accepted_rows: reqInt(s, "accepted_rows", path),
    rejected_rows: reqInt(s, "rejected_rows", path),
    observations_inserted: reqInt(s, "observations_inserted", path),
    observations_skipped: reqInt(s, "observations_skipped", path),
    status: reqStr(s, "status", path),
  };
}

export function parseDqRowsTotals(raw: unknown, path: string): DqRowsTotalsDTO {
  const r = reqObj(raw, path);
  return {
    total: reqInt(r, "total", path),
    futcom_rows: reqInt(r, "futcom_rows", path),
    options_rows: reqInt(r, "options_rows", path),
    futidx_rows: reqInt(r, "futidx_rows", path),
    rejected_rows: reqInt(r, "rejected_rows", path),
  };
}

export function parseDqContractSpecVerification(
  raw: unknown,
  path: string,
): DqContractSpecVerificationDTO {
  const v = reqObj(raw, path);
  return {
    verified: reqInt(v, "verified", path),
    unverified: reqInt(v, "unverified", path),
    conflicting: reqInt(v, "conflicting", path),
  };
}

export function parseDqHistorySufficiency(raw: unknown, path: string): DqHistorySufficiencyDTO {
  const h = reqObj(raw, path);
  return {
    distinct_trade_dates: reqInt(h, "distinct_trade_dates", path),
    minimum_required: reqInt(h, "minimum_required", path),
    sufficient_for_signal: reqBool(h, "sufficient_for_signal", path),
    sufficient_for_backtest: reqBool(h, "sufficient_for_backtest", path),
  };
}

export function parseDataQualityReport(raw: unknown): DataQualityReportDTO {
  const r = reqObj(raw, "data_quality");
  const sources = entry(r, "sources", "data_quality");
  const issues = entry(r, "issues", "data_quality");
  const dates = entry(r, "dates_available", "data_quality");
  if (!Array.isArray(sources)) fail("data_quality.sources", "array");
  if (!Array.isArray(issues)) fail("data_quality.issues", "array");
  if (!Array.isArray(dates)) fail("data_quality.dates_available", "array");
  return {
    generated_at: reqStr(r, "generated_at", "data_quality"),
    sources: sources.map((item, i) => parseDqSourceStatus(item, `data_quality.sources[${i}]`)),
    rows: parseDqRowsTotals(r.rows, "data_quality.rows"),
    dates_available: dates.map((item, i) => {
      if (typeof item !== "string") fail(`data_quality.dates_available[${i}]`, "string");
      return item;
    }),
    issues: issues.map((item, i) => {
      const is = reqObj(item, `data_quality.issues[${i}]`);
      const p = `data_quality.issues[${i}]`;
      return {
        code: reqStr(is, "code", p),
        severity: reqStr(is, "severity", p),
        count: reqInt(is, "count", p),
        message: reqStr(is, "message", p),
      };
    }),
    contract_spec_verification: parseDqContractSpecVerification(
      r.contract_spec_verification,
      "data_quality.contract_spec_verification",
    ),
    history_sufficiency: parseDqHistorySufficiency(
      r.history_sufficiency,
      "data_quality.history_sufficiency",
    ),
  };
}
