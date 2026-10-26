"""Data-quality models for GET /api/data-quality (docs/API_CONTRACT.md §7)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class DataQualityIssue(BaseModel):
    code: str
    severity: str  # info | warning | error | critical
    count: int
    message: str


class SourceStatus(BaseModel):
    file: str
    ingested_at: str
    input_rows: int
    accepted_rows: int
    rejected_rows: int
    observations_inserted: int
    observations_skipped: int
    status: str = "ingested"


class RowsTotals(BaseModel):
    total: int
    futcom_rows: int
    options_rows: int
    futidx_rows: int
    rejected_rows: int


class ContractSpecVerification(BaseModel):
    verified: int
    unverified: int
    conflicting: int


class HistorySufficiency(BaseModel):
    distinct_trade_dates: int
    minimum_required: int
    sufficient_for_signal: bool
    sufficient_for_backtest: bool


class DataQualityReport(BaseModel):
    generated_at: str
    sources: list[SourceStatus]
    rows: RowsTotals
    dates_available: list[str]
    issues: list[DataQualityIssue] = Field(default_factory=list)
    contract_spec_verification: ContractSpecVerification
    history_sufficiency: HistorySufficiency
