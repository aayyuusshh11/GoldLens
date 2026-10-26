"""Pydantic request/response models for the data API (docs/API_CONTRACT.md)."""
from __future__ import annotations

from pydantic import BaseModel, Field


# --------------------------------------------------------------------- #
# health                                                                #
# --------------------------------------------------------------------- #

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    data_available: bool
    distinct_trade_dates: int
    latest_data_date: str | None = None


# --------------------------------------------------------------------- #
# contracts                                                             #
# --------------------------------------------------------------------- #

class ContractOut(BaseModel):
    contract_id: str
    symbol: str
    instrument_type: str
    expiry_date: str | None = None
    contract_size: float | None = None
    units: str | None = None
    quotation_unit: str | None = None
    purity: str | None = None
    tick_size: float | None = None
    expiry_rule: str | None = None
    verification_status: str
    verified_fields: list[str] = Field(default_factory=list)
    source: str | None = None
    verification_timestamp: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    first_observed_date: str | None = None
    last_observed_date: str | None = None
    updated_at: str | None = None


class ContractsResponse(BaseModel):
    total: int
    count: int
    offset: int
    contracts: list[ContractOut]


# --------------------------------------------------------------------- #
# pairs                                                                 #
# --------------------------------------------------------------------- #

class LegSummary(BaseModel):
    contract_id: str
    expiry_date: str


class PairSummary(BaseModel):
    pair_id: str
    symbol: str
    near: LegSummary
    far: LegSummary
    status: str  # candidate_only | eligible
    reason_codes: list[str] = Field(default_factory=list)
    history_days: int  # distinct overlapping observation dates


class PairsResponse(BaseModel):
    pairs: list[PairSummary]
    warnings: list[dict] = Field(default_factory=list)


class SpreadObservation(BaseModel):
    trade_date: str
    near_close: float | None = None
    far_close: float | None = None
    spread: float | None = None
    status: str  # observation | reference_only
    reason_codes: list[str] = Field(default_factory=list)


class PairHistoryResponse(BaseModel):
    pair_id: str
    symbol: str
    near_expiry: str
    far_expiry: str
    observations: list[SpreadObservation]
    count: int
    warnings: list[dict] = Field(default_factory=list)


# --------------------------------------------------------------------- #
# signals                                                               #
# --------------------------------------------------------------------- #

class SignalAnalyzeRequest(BaseModel):
    pair_id: str
    as_of_date: str | None = None  # default: latest stored trade date


class DataQualityBlock(BaseModel):
    distinct_trade_dates: int
    latest_data_date: str | None = None
    trading_days_available: int
    warnings: list[dict] = Field(default_factory=list)


class SignalAnalyzeResponse(BaseModel):
    pair_id: str
    as_of_date: str
    decision: str  # NO_TRADE | BUY_NEAR_SELL_FAR | SELL_NEAR_BUY_FAR
    reason_codes: list[str] = Field(default_factory=list)
    spread: float | None = None
    z_score: float | None = None
    gross_edge: float | None = None
    estimated_cost: float | None = None
    net_edge: float | None = None
    data_quality: DataQualityBlock
    notes: str | None = None


# --------------------------------------------------------------------- #
# backtests                                                             #
# --------------------------------------------------------------------- #

class BacktestRunRequest(BaseModel):
    pair_id: str
    start_date: str | None = None
    end_date: str | None = None
    strategy_version: str = "default"


class EvaluationPeriod(BaseModel):
    start_date: str | None = None
    end_date: str | None = None


class BacktestRunResponse(BaseModel):
    run_id: str
    pair_id: str
    strategy_version: str
    evaluation_period: EvaluationPeriod
    observation_count: int = 0
    completed_trades: int = 0
    gross_pnl: float | None = None
    estimated_costs: float | None = None
    net_pnl: float | None = None
    max_drawdown: float | None = None
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[dict] = Field(default_factory=list)
    runnable: bool = False


# --------------------------------------------------------------------- #
# ingest                                                                #
# --------------------------------------------------------------------- #

class IngestRequest(BaseModel):
    path: str | None = None  # default: bundled supplied CSV


class IngestResponse(BaseModel):
    ingestion_id: str
    accepted_rows: int
    rejected_rows: int
    warned_rows: int
    warnings: list[dict] = Field(default_factory=list)


# --------------------------------------------------------------------- #
# error                                                                 #
# --------------------------------------------------------------------- #

class ApiErrorDetail(BaseModel):
    code: str
    message: str
    details: dict = Field(default_factory=dict)


class ApiError(BaseModel):
    error: ApiErrorDetail
