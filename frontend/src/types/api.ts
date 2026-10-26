/**
 * GoldLens frontend DTOs — aligned 1:1 with the SETTLED backend contract:
 * `origin/backend` → `backend/app/schemas/api_models.py`, `schemas/data_quality.py`,
 * and docs/API_CONTRACT.md (backend branch version).
 *
 * P9 note (docs/INTEGRATION_BLOCKERS.md §6): the old single mega-report
 * (`api_contract_sample.json`) is a quant-boundary reference artefact, NOT an
 * API response. The settled API is 7 disaggregated routes; the app composes
 * them per screen. Field names are the backend's snake_case names and MUST NOT
 * be renamed. Nullable fields stay nullable: null means "not computed /
 * unknown / unverified", never zero. Two known doc-vs-code deltas are resolved
 * in favor of the backend code (it is what the server actually emits):
 *   1. Pair-history observation status: "observation" | "reference_only"
 *      (doc §4 example says "single_reference" — stale).
 *   2. Data-quality rows/sources shapes follow schemas/data_quality.py, not
 *      the doc §7 example.
 */

/** Dates as serialized by the backend: YYYY-MM-DD. */
export type IsoDate = string;

/**
 * Symbol filter identity. NOT a closed enum: symbols come from ingested data
 * (pairs/contracts), so this is an open string with a runtime-normalized
 * canonical form (the old hardcoded GOLD|GOLDM list is gone).
 */
export type Symbol = string;

/** Warning/tool-note item shape used by pairs/history/signals/backtests. */
export interface WarningItemDTO {
  code: string;
  severity: string; // info | warning | error | critical (unknown values render safely)
  count: number;
  message: string;
}

// --------------------------------------------------------------------- //
// GET /api/health
// --------------------------------------------------------------------- //

export interface HealthDTO {
  status: string;
  service: string;
  version: string;
  data_available: boolean;
  distinct_trade_dates: number;
  latest_data_date: IsoDate | null;
}

// --------------------------------------------------------------------- //
// GET /api/contracts
// --------------------------------------------------------------------- //

export interface ContractDTO {
  contract_id: string;
  symbol: string;
  instrument_type: string;
  expiry_date: IsoDate | null;
  /** Specification fields stay null until verified — never guessed. */
  contract_size: number | null;
  units: string | null;
  quotation_unit: string | null;
  purity: string | null;
  tick_size: number | null;
  expiry_rule: string | null;
  verification_status: string;
  verified_fields: string[];
  source: string | null;
  verification_timestamp: string | null;
  effective_from: IsoDate | null;
  effective_to: IsoDate | null;
  first_observed_date: IsoDate | null;
  last_observed_date: IsoDate | null;
  updated_at: string | null;
}

export interface ContractsResponseDTO {
  total: number;
  count: number;
  offset: number;
  contracts: ContractDTO[];
}

// --------------------------------------------------------------------- //
// GET /api/pairs
// --------------------------------------------------------------------- //

export interface PairLegDTO {
  contract_id: string;
  expiry_date: IsoDate;
}

export interface PairSummaryDTO {
  pair_id: string;
  symbol: string;
  near: PairLegDTO;
  far: PairLegDTO;
  /** candidate_only | eligible — "eligible" requires quant confirmation. */
  status: string;
  reason_codes: string[];
  /** Distinct overlapping observation dates for the symbol. */
  history_days: number;
}

export interface PairsResponseDTO {
  pairs: PairSummaryDTO[];
  warnings: WarningItemDTO[];
}

// --------------------------------------------------------------------- //
// GET /api/pairs/{pair_id}/history
// --------------------------------------------------------------------- //

export interface SpreadObservationDTO {
  trade_date: IsoDate;
  /** Backend semantic: closing prices as reported; missing = null. */
  near_close: number | null;
  far_close: number | null;
  /** Backend formula: near_close − far_close (can be negative). */
  spread: number | null;
  /** observation (both legs tradable) | reference_only (never claimed as history). */
  status: string;
  /** e.g. ZERO_VOLUME, STALE_PRICE, MISSING_OHLC. */
  reason_codes: string[];
}

export interface PairHistoryDTO {
  pair_id: string;
  symbol: string;
  near_expiry: IsoDate;
  far_expiry: IsoDate;
  observations: SpreadObservationDTO[];
  count: number;
  warnings: WarningItemDTO[];
}

// --------------------------------------------------------------------- //
// POST /api/signals/analyze
// --------------------------------------------------------------------- //

export interface SignalAnalyzeRequestDTO {
  pair_id: string;
  /** Optional: backend defaults to the latest stored trade date. */
  as_of_date?: IsoDate | null;
}

export interface SignalDataQualityBlockDTO {
  distinct_trade_dates: number;
  latest_data_date: IsoDate | null;
  trading_days_available: number;
  warnings: WarningItemDTO[];
}

export interface SignalAnalyzeDTO {
  pair_id: string;
  as_of_date: IsoDate;
  /** NO_TRADE | BUY_NEAR_SELL_FAR | SELL_NEAR_BUY_FAR (decisions pending quant). */
  decision: string;
  reason_codes: string[];
  spread: number | null;
  /** All null until the quant service is wired (GOLDLENS_QUANT_PACKAGE). */
  z_score: number | null;
  gross_edge: number | null;
  estimated_cost: number | null;
  net_edge: number | null;
  data_quality: SignalDataQualityBlockDTO;
  notes: string | null;
}

// --------------------------------------------------------------------- //
// POST /api/backtests/run
// --------------------------------------------------------------------- //

export interface BacktestRunRequestDTO {
  pair_id: string;
  start_date?: IsoDate | null;
  end_date?: IsoDate | null;
  strategy_version?: string;
}

export interface EvaluationPeriodDTO {
  start_date: IsoDate | null;
  end_date: IsoDate | null;
}

export interface BacktestRunDTO {
  run_id: string;
  pair_id: string;
  strategy_version: string;
  evaluation_period: EvaluationPeriodDTO;
  observation_count: number;
  completed_trades: number;
  /** Metrics exist only from the quant service; guaranteed honest else null. */
  gross_pnl: number | null;
  estimated_costs: number | null;
  net_pnl: number | null;
  max_drawdown: number | null;
  assumptions: string[];
  warnings: WarningItemDTO[];
  runnable: boolean;
}

// --------------------------------------------------------------------- //
// GET /api/data-quality
// --------------------------------------------------------------------- //

export interface DataQualityIssueDTO {
  code: string;
  severity: string; // info | warning | error | critical
  count: number;
  message: string;
}

export interface DqSourceStatusDTO {
  file: string;
  ingested_at: string;
  input_rows: number;
  accepted_rows: number;
  rejected_rows: number;
  observations_inserted: number;
  observations_skipped: number;
  status: string;
}

export interface DqRowsTotalsDTO {
  total: number;
  futcom_rows: number;
  options_rows: number;
  futidx_rows: number;
  rejected_rows: number;
}

export interface DqContractSpecVerificationDTO {
  verified: number;
  unverified: number;
  conflicting: number;
}

export interface DqHistorySufficiencyDTO {
  distinct_trade_dates: number;
  minimum_required: number;
  sufficient_for_signal: boolean;
  sufficient_for_backtest: boolean;
}

export interface DataQualityReportDTO {
  generated_at: string;
  sources: DqSourceStatusDTO[];
  rows: DqRowsTotalsDTO;
  dates_available: IsoDate[];
  issues: DataQualityIssueDTO[];
  contract_spec_verification: DqContractSpecVerificationDTO;
  history_sufficiency: DqHistorySufficiencyDTO;
}
