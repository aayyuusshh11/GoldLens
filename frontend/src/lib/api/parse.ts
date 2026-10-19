import type {
  BacktestReportDTO,
  EligibleContractDTO,
  MetricsDTO,
  PairDTO,
  SignalDTO,
  SpreadObservationDTO,
  StrategyConfigDTO,
  TradeDTO,
  ZScorePointDTO,
  DataProvenanceDTO,
} from "../../types/api";
import { ApiRequestError } from "./errors";

/** Type re-export: consumers import the validated DTO from this module. */
export type { BacktestReportDTO };

/**
 * Runtime normalizer: unknown → DTO, or ApiRequestError(kind "schema").
 *
 * Guards the frontend against backend drift without fabricating values:
 * anything structurally required but missing/invalid raises a schema error
 * naming the path. Nullable fields may be null; null is never coerced to 0.
 * Extra unknown keys are ignored (forward compatibility).
 */

export const REPORT_TOP_LEVEL_KEYS = [
  "config",
  "data_provenance",
  "pair",
  "spread_observations",
  "z_score",
  "signals",
  "trades",
  "eligible_contracts",
  "metrics",
  "train_metrics",
  "test_metrics",
  "walk_forward_cmp",
  "verdict",
  "is_valid_backtest",
] as const;

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

function parseConfig(raw: unknown, path: string): StrategyConfigDTO {
  const c = reqObj(raw, path);
  return {
    lookback_days: reqNum(c, "lookback_days", path),
    z_entry: reqNum(c, "z_entry", path),
    z_exit: reqNum(c, "z_exit", path),
    stop_z: reqNum(c, "stop_z", path),
    max_holding_days: reqNum(c, "max_holding_days", path),
    min_hist_days: reqNum(c, "min_hist_days", path),
    exec_mode: reqStr(c, "exec_mode", path),
    allow_overlap: reqBool(c, "allow_overlap", path),
    lots_per_leg: reqNum(c, "lots_per_leg", path),
    walk_forward_folds: reqNum(c, "walk_forward_folds", path),
    costs: optStr(c, "costs", path),
  };
}

function parseProvenance(raw: unknown, path: string): DataProvenanceDTO {
  const p = reqObj(raw, path);
  return {
    trading_days: reqNum(p, "trading_days", path),
    date_range: strArray(p, "date_range", path),
    spec_checks: strArray(p, "spec_checks", path),
  };
}

function parsePair(raw: unknown, path: string): PairDTO {
  const p = reqObj(raw, path);
  const rejectionsRaw = entry(p, "rejections", path);
  const rejectionsObj = reqObj(rejectionsRaw, `${path}.rejections`);
  const rejections: Record<string, number> = {};
  for (const key of Object.keys(rejectionsObj)) {
    const value = reqNum(rejectionsObj, key, `${path}.rejections`);
    rejections[key] = value;
  }
  return {
    symbol: reqStr(p, "symbol", path),
    near_expiry: optStr(p, "near_expiry", path),
    far_expiry: optStr(p, "far_expiry", path),
    rejections,
    filter_failures: reqNum(p, "filter_failures", path),
  };
}

function parseSpreadObservations(raw: unknown, path: string): SpreadObservationDTO[] {
  if (!Array.isArray(raw)) fail(path, "array");
  return raw.map((item, i) => {
    const p = `${path}[${i}]`;
    const o = reqObj(item, p);
    return {
      trade_date: reqStr(o, "trade_date", p),
      symbol: optStr(o, "symbol", p),
      near_expiry: optStr(o, "near_expiry", p),
      far_expiry: optStr(o, "far_expiry", p),
      near_close: reqNum(o, "near_close", p),
      far_close: reqNum(o, "far_close", p),
      spread: reqNum(o, "spread", p),
      stale: reqBool(o, "stale", p),
    };
  });
}

function parseZScore(raw: unknown, path: string): ZScorePointDTO[] {
  if (!Array.isArray(raw)) fail(path, "array");
  return raw.map((item, i) => {
    const p = `${path}[${i}]`;
    const o = reqObj(item, p);
    return {
      trade_date: reqStr(o, "trade_date", p),
      spread: optNum(o, "spread", p),
      rolling_mean: optNum(o, "rolling_mean", p),
      rolling_std: optNum(o, "rolling_std", p),
      z: optNum(o, "z", p),
    };
  });
}

function parseSignals(raw: unknown, path: string): SignalDTO[] {
  if (!Array.isArray(raw)) fail(path, "array");
  return raw.map((item, i) => {
    const p = `${path}[${i}]`;
    const o = reqObj(item, p);
    return {
      trade_date: reqStr(o, "trade_date", p),
      signal: reqStr(o, "signal", p),
      z: optNum(o, "z", p),
      spread: optNum(o, "spread", p),
      mean: optNum(o, "mean", p),
      std: optNum(o, "std", p),
      filters_ok: reqBool(o, "filters_ok", p),
      filter_reason: optStr(o, "filter_reason", p),
      position_before: reqStr(o, "position_before", p),
      rationale: reqStr(o, "rationale", p),
      no_trade_reason: optStr(o, "no_trade_reason", p),
    };
  });
}

function parseTrades(raw: unknown, path: string): TradeDTO[] {
  if (!Array.isArray(raw)) fail(path, "array");
  return raw.map((item, i) => {
    const p = `${path}[${i}]`;
    const o = reqObj(item, p);
    return {
      leg_symbol: reqStr(o, "leg_symbol", p),
      direction: reqStr(o, "direction", p),
      entry_signal_date: reqStr(o, "entry_signal_date", p),
      entry_exec_date: reqStr(o, "entry_exec_date", p),
      entry_spread: reqNum(o, "entry_spread", p),
      entry_z: optNum(o, "entry_z", p),
      entry_rationale: reqStr(o, "entry_rationale", p),
      exit_exec_date: optStr(o, "exit_exec_date", p),
      exit_spread: optNum(o, "exit_spread", p),
      exit_reason: reqStr(o, "exit_reason", p),
      gross_pnl_rupees: optNum(o, "gross_pnl_rupees", p),
      holding_days: reqNum(o, "holding_days", p),
    };
  });
}

function parseEligibleContracts(raw: unknown, path: string): EligibleContractDTO[] {
  if (!Array.isArray(raw)) fail(path, "array");
  return raw.map((item, i) => {
    const p = `${path}[${i}]`;
    const o = reqObj(item, p);
    return {
      trade_date: optStr(o, "trade_date", p),
      symbol: reqStr(o, "symbol", p),
      expiry: optStr(o, "expiry", p),
      days_to_expiry: optNum(o, "days_to_expiry", p),
      close: optNum(o, "close", p),
      volume_lots: optNum(o, "volume_lots", p),
      open_interest_lots: optNum(o, "open_interest_lots", p),
      value_lakhs: optNum(o, "value_lakhs", p),
      eligible: reqBool(o, "eligible", p),
      reason: optStr(o, "reason", p),
      lot_size_g: optNum(o, "lot_size_g", p),
      quote_basis_g: optNum(o, "quote_basis_g", p),
    };
  });
}

function parseMetrics(raw: unknown, path: string): MetricsDTO {
  const m = reqObj(raw, path);
  return {
    status: reqStr(m, "status", path),
    n_days: reqNum(m, "n_days", path),
    n_trades: reqNum(m, "n_trades", path),
    gross_pnl_rupees: optNum(m, "gross_pnl_rupees", path),
    net_pnl_rupees: optNum(m, "net_pnl_rupees", path),
    win_rate: optNum(m, "win_rate", path),
    max_drawdown_rupees: optNum(m, "max_drawdown_rupees", path),
    net_max_drawdown_rupees: optNum(m, "net_max_drawdown_rupees", path),
    sharpe_ratio: optNum(m, "sharpe_ratio", path),
    net_sharpe_ratio: optNum(m, "net_sharpe_ratio", path),
    total_cost_rupees: optNum(m, "total_cost_rupees", path),
    avg_pnl_per_trade: optNum(m, "avg_pnl_per_trade", path),
    notes: strArray(m, "notes", path),
    costs_assumption: optStr(m, "costs_assumption", path),
  };
}

function parseMetricsOrNull(raw: unknown, path: string): MetricsDTO | null {
  return raw === null || raw === undefined ? null : parseMetrics(raw, path);
}

function parseFoldEntries(raw: unknown, path: string): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) fail(path, "array");
  return raw.map((item, i) => {
    const o = reqObj(item, `${path}[${i}]`);
    return { ...o };
  });
}

/** unknown → BacktestReportDTO; throws ApiRequestError(kind "schema") on drift. */
export function parseBacktestReport(raw: unknown): BacktestReportDTO {
  const root = reqObj(raw, "report");
  for (const key of REPORT_TOP_LEVEL_KEYS) {
    if (!(key in root)) fail(`report.${key}`, "required key (missing)");
  }
  return {
    config: parseConfig(root.config, "report.config"),
    data_provenance: parseProvenance(root.data_provenance, "report.data_provenance"),
    pair: parsePair(root.pair, "report.pair"),
    spread_observations: parseSpreadObservations(root.spread_observations, "report.spread_observations"),
    z_score: parseZScore(root.z_score, "report.z_score"),
    signals: parseSignals(root.signals, "report.signals"),
    trades: parseTrades(root.trades, "report.trades"),
    eligible_contracts: parseEligibleContracts(root.eligible_contracts, "report.eligible_contracts"),
    metrics: parseMetricsOrNull(root.metrics, "report.metrics"),
    train_metrics: parseMetricsOrNull(root.train_metrics, "report.train_metrics"),
    test_metrics: parseMetricsOrNull(root.test_metrics, "report.test_metrics"),
    walk_forward_cmp: parseFoldEntries(root.walk_forward_cmp, "report.walk_forward_cmp"),
    verdict: reqStr(root, "verdict", "report"),
    is_valid_backtest: reqBool(root, "is_valid_backtest", "report"),
  };
}

export interface HealthDTO {
  status: string;
  service: string;
  quant_module: string;
}

export function parseHealth(raw: unknown): HealthDTO {
  const h = reqObj(raw, "health");
  return {
    status: reqStr(h, "status", "health"),
    service: reqStr(h, "service", "health"),
    quant_module: reqStr(h, "quant_module", "health"),
  };
}
