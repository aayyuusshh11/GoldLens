/**
 * Report DTO types — Phase 3, "CONFIRMED" per docs/API_CONTRACT.md §2.
 *
 * Field names match the `api.py` boundary EXACTLY (snake_case, `null` for
 * Python `None`). The frontend MUST NOT rename fields at the transport
 * boundary. Optional fields are marked with `?` only where the supplied api.py
 * genuinely allows absence (`eligible_contracts` defaults to a factory;
 * `metrics`/`train_metrics`/`test_metrics` may be None; `spec_checks` and
 * `reason` strings may be absent in hand-crafted payloads).
 */

export interface BacktestConfig {
  lookback_days: number;
  z_entry: number;
  z_exit: number;
  stop_z: number;
  max_holding_days: number;
  min_hist_days: number;
  exec_mode: string;
  allow_overlap: boolean;
  lots_per_leg: number;
  walk_forward_folds: number;
  /** e.g. "not configured (gross-only)" | "user-verified supplied" */
  costs: string;
}

export interface DataProvenance {
  trading_days: number;
  /** Documented to be a [min, max] ISO pair; typed string[] to stay tolerant of hand-crafted payloads. */
  date_range: string[];
  /** Verbatim PASS/FAIL spec cross-check strings; may be absent (⇒ "No specification checks reported"). */
  spec_checks?: string[];
}

export interface PairInfo {
  symbol: string;
  near_expiry: string | null;
  far_expiry: string | null;
  rejections: Record<string, number>;
  filter_failures: number;
}

export interface EligibleContractDTO {
  trade_date: string | null;
  symbol: string;
  expiry: string | null;
  days_to_expiry: number | null;
  close: number | null;
  volume_lots: number | null;
  open_interest_lots: number | null;
  value_lakhs: number | null;
  eligible: boolean;
  /** Pipe-joined machine codes, e.g. "symbol_not_verified|vol<500" — display verbatim. */
  reason: string | null;
  lot_size_g: number | null;
  /** Semantics unconfirmed (B11) — render verbatim or "Not available". */
  quote_basis_g: number | null;
}

export interface SpreadPointDTO {
  trade_date: string;
  symbol: string | null;
  near_expiry: string;
  far_expiry: string;
  near_close: number;
  far_close: number;
  spread: number;
  stale: boolean;
}

export interface ZScorePointDTO {
  trade_date: string;
  spread: number | null;
  rolling_mean: number | null;
  rolling_std: number | null;
  /** Null while history is insufficient — NEVER render as 0. */
  z: number | null;
}

export interface SignalDTO {
  trade_date: string;
  /** Verbatim backend label: "NO TRADE" | "LONG" | "SHORT" | "EXIT" | … */
  signal: string;
  z: number | null;
  spread: number | null;
  mean: number | null;
  std: number | null;
  filters_ok: boolean;
  filter_reason: string;
  position_before: string;
  rationale: string;
  no_trade_reason: string | null;
}

export interface TradeDTO {
  leg_symbol: string;
  direction: string;
  entry_signal_date: string;
  entry_exec_date: string;
  entry_spread: number;
  entry_z: number | null;
  entry_rationale: string;
  exit_exec_date: string | null;
  exit_spread: number | null;
  exit_reason: string;
  gross_pnl_rupees: number | null;
  /** calendar-vs-trading-days basis unconfirmed (B8) — label generically until owner answers. */
  holding_days: number;
}

export interface MetricsDTO {
  /** "diagnostics_only" | "backtest" — treat diagnostics_only as NOT a valid backtest. */
  status: string;
  n_days: number;
  n_trades: number;
  /** ALL financial figures can be null (withheld) — never substitute 0. */
  gross_pnl_rupees: number | null;
  net_pnl_rupees: number | null;
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

/** Column semantics unconfirmed (B9) — rendered verbatim/derived-by-owner only. */
export type WalkForwardFold = Record<string, unknown>;

export interface BacktestReportDTO {
  config: BacktestConfig;
  data_provenance: DataProvenance;
  pair: PairInfo;
  spread_observations: SpreadPointDTO[];
  z_score: ZScorePointDTO[];
  signals: SignalDTO[];
  trades: TradeDTO[];
  eligible_contracts: EligibleContractDTO[];
  metrics: MetricsDTO | null;
  train_metrics: MetricsDTO | null;
  test_metrics: MetricsDTO | null;
  walk_forward_cmp: WalkForwardFold[];
  /** Backend verdict text — display verbatim in the validity banner. */
  verdict: string;
  is_valid_backtest: boolean;
}

/* ---- Proposed response shapes (no backend exists yet — docs/API_CONTRACT.md §1) ---- */

export interface HealthResponse {
  /** Exact health payload shape is unconfirmed; the app only checks HTTP 200. */
  [key: string]: unknown;
}

export interface PairSummaryDTO {
  symbol: string;
  near_expiry: string | null;
  far_expiry: string | null;
}

export interface PairHistoryResponse {
  symbol?: string;
  near?: string;
  far?: string;
  observations?: SpreadPointDTO[];
  /** z-series may not be included by the first backend cut — treat optional. */
  z?: ZScorePointDTO[];
}

export interface SignalAnalyzeResponse {
  signal?: SignalDTO;
  /** Extra forensic context fields are unconfirmed — parsed defensively by callers. */
  [key: string]: unknown;
}

export interface DataQualityResponse {
  /** Shape unconfirmed until Araham ships the route; page narrows defensively. */
  datasets?: unknown;
  [key: string]: unknown;
}
