/**
 * GoldLens frontend DTOs — aligned 1:1 with `reference/quant/api.py`
 * (`BacktestReportDTO` and friends) and `reference/samples/api_contract_sample.json`.
 *
 * Field names are the quant module's existing snake_case names and MUST NOT be
 * renamed. Nullable fields stay nullable: null means "not computed /
 * unavailable", never zero. See docs/API_CONTRACT.md and docs/DATA_SCHEMA.md.
 */

/** Dates as serialized by the quant boundary: YYYY-MM-DD. */
export type IsoDate = string;

/** Symbol families targeted by this research tool. */
export type ReportSymbol = "GOLD" | "GOLDM";

/** All selectable families; the fixture sample only has data for GOLDM. */
export const REPORT_SYMBOLS: readonly ReportSymbol[] = ["GOLD", "GOLDM"];

export interface StrategyConfigDTO {
  lookback_days: number;
  z_entry: number;
  z_exit: number;
  stop_z: number;
  max_holding_days: number;
  min_hist_days: number;
  /** e.g. "next_close" — execution mode respected by the boundary. */
  exec_mode: string;
  allow_overlap: boolean;
  lots_per_leg: number;
  walk_forward_folds: number;
  /** null or "not configured (gross-only)" ⇒ net metrics are withheld. */
  costs: string | null;
}

export interface DataProvenanceDTO {
  trading_days: number;
  /** [first, last] — may be empty when the backend cannot supply it. */
  date_range: IsoDate[];
  /** Strings prefixed "PASS …" / "FAIL …" from the spec cross-check. */
  spec_checks: string[];
}

export interface PairDTO {
  symbol: string;
  near_expiry: IsoDate | null;
  far_expiry: IsoDate | null;
  /** e.g. { invalid_price_rows_dropped: 0, stale_rows_flagged: 0 } */
  rejections: Record<string, number>;
  filter_failures: number;
}

export interface SpreadObservationDTO {
  trade_date: IsoDate;
  symbol: string | null;
  near_expiry: IsoDate | null;
  far_expiry: IsoDate | null;
  near_close: number;
  far_close: number;
  /** Spread value as produced by the quant pipeline (unit: rupees). */
  spread: number;
  stale: boolean;
}

export interface ZScorePointDTO {
  trade_date: IsoDate;
  spread: number | null;
  rolling_mean: number | null;
  rolling_std: number | null;
  /** null = insufficient rolling history. Never render as 0. */
  z: number | null;
}

export interface SignalDTO {
  trade_date: IsoDate;
  /** LONG | SHORT | EXIT | NO TRADE — unknown labels still render safely. */
  signal: string;
  z: number | null;
  spread: number | null;
  mean: number | null;
  std: number | null;
  filters_ok: boolean;
  filter_reason: string | null;
  position_before: string;
  rationale: string;
  no_trade_reason: string | null;
}

export interface TradeDTO {
  leg_symbol: string;
  direction: string;
  entry_signal_date: IsoDate;
  entry_exec_date: IsoDate;
  entry_spread: number;
  entry_z: number | null;
  entry_rationale: string;
  exit_exec_date: IsoDate | null;
  exit_spread: number | null;
  exit_reason: string;
  /** null when withheld (e.g. no completed exit) — never 0. */
  gross_pnl_rupees: number | null;
  holding_days: number;
}

export interface EligibleContractDTO {
  trade_date: IsoDate | null;
  symbol: string;
  expiry: IsoDate | null;
  days_to_expiry: number | null;
  close: number | null;
  volume_lots: number | null;
  open_interest_lots: number | null;
  value_lakhs: number | null;
  eligible: boolean;
  /** Pipe-separated filter outcome tokens, e.g. "vol<500|oi<1000". */
  reason: string | null;
  /** null = no verified specification for this symbol. */
  lot_size_g: number | null;
  quote_basis_g: number | null;
}

export interface MetricsDTO {
  status: "backtest" | "diagnostics_only" | (string & {});
  n_days: number;
  n_trades: number;
  gross_pnl_rupees: number | null;
  /** null while costs are unconfigured — must never be displayed as a number. */
  net_pnl_rupees: number | null;
  /** Scale (fraction vs percent) unconfirmed by quant owner — see docs/INTEGRATION_BLOCKERS.md. */
  win_rate: number | null;
  max_drawdown_rupees: number | null;
  net_max_drawdown_rupees: number | null;
  sharpe_ratio: number | null;
  net_sharpe_ratio: number | null;
  total_cost_rupees: number | null;
  avg_pnl_per_trade: number | null;
  notes: string[];
  costs_assumption: string | null;
}

/**
 * Inner keys of walk-forward comparisons are not documented yet; rendered
 * generically until confirmed (docs/INTEGRATION_BLOCKERS.md).
 */
export type WalkForwardFold = Record<string, unknown>;

export interface BacktestReportDTO {
  config: StrategyConfigDTO;
  data_provenance: DataProvenanceDTO;
  pair: PairDTO;
  spread_observations: SpreadObservationDTO[];
  z_score: ZScorePointDTO[];
  signals: SignalDTO[];
  trades: TradeDTO[];
  eligible_contracts: EligibleContractDTO[];
  metrics: MetricsDTO | null;
  train_metrics: MetricsDTO | null;
  test_metrics: MetricsDTO | null;
  walk_forward_cmp: WalkForwardFold[];
  verdict: string;
  is_valid_backtest: boolean;
}
