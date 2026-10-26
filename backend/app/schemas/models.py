"""Pydantic models shared by ingestion, storage, and the API layer.

Mirrors docs/DATA_SCHEMA.md (Phase 1 contract). Field names are stable;
missing values are None, never 0 or "".
"""
from __future__ import annotations

from pydantic import BaseModel, Field  # noqa: F401 (Field reserved for contract growth)

INSTRUMENT_TYPES = ("FUTCOM", "FUTIDX", "OPTFUT", "OPTIDX")


class NormalizedObservation(BaseModel):
    """One observed row for one contract on one trade_date (DATA_SCHEMA §2)."""

    # identity
    contract_id: str
    trade_date: str | None = None
    symbol: str
    symbol_raw: str
    instrument_type: str
    expiry_date: str | None = None
    option_type: str | None = None
    strike_price: float | None = None

    # prices (nullable; never backfilled with 0)
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    previous_close: float | None = None
    settlement_price: float | None = None  # always null in this source

    # volumes / value
    volume_lots: float | None = None
    volume_quantity: float | None = None
    volume_unit: str | None = None
    value_lacs: float | None = None
    open_interest_lots: float | None = None

    # derived structural flags
    has_ohlc: bool = False
    zero_volume: bool = False
    is_tradable_candidate: bool = False

    # provenance
    source_file: str
    source_row: int
    ingested_at: str

    # validation metadata (reason codes from DATA_SCHEMA §5)
    validation_flags: list[str] = Field(default_factory=list)


class RejectedRow(BaseModel):
    """A row that could not be attached to the canonical model; always reported."""

    source_row: int
    raw_symbol: str | None
    reason_code: str
    reason: str


class IngestIssue(BaseModel):
    """Aggregated issue count in the validation report."""

    code: str
    count: int
    message: str


class IngestReport(BaseModel):
    """Concise machine-readable validation report (Phase 2 acceptance)."""

    input_file: str
    input_row_count: int
    accepted_row_count: int
    rejected_row_count: int
    futures_row_count: int  # FUTCOM
    options_row_count: int  # OPTFUT + OPTIDX
    index_rows_count: int  # FUTIDX + OPTIDX index family (reporting only)
    unsupported_instrument_rows: int  # rows excluded from the gold-futures path
    missing_ohlc_rows: int
    zero_volume_rows: int
    missing_volume_rows: int
    invalid_expiry_rows: int
    duplicate_business_key_rows: int  # rows beyond the first per business key
    unique_trade_dates: list[str]
    unique_symbols: list[str]
    gold_family_future_rows: dict[str, int]  # GOLD/GOLDM/... -> FUTCOM row count
    rejected_by_reason: list[IngestIssue]
    flag_counts: list[IngestIssue]

    def render(self) -> str:
        """Human-readable summary for the CLI."""
        lines = [
            f"file                : {self.input_file}",
            f"input rows          : {self.input_row_count}",
            f"accepted            : {self.accepted_row_count}",
            f"rejected            : {self.rejected_row_count}",
            f"FUTCOM (futures)    : {self.futures_row_count}",
            f"options (OPT*)      : {self.options_row_count}",
            f"index contracts     : {self.index_rows_count}",
            f"non-gold-path rows  : {self.unsupported_instrument_rows}",
            f"missing OHLC rows   : {self.missing_ohlc_rows}",
            f"zero-volume rows    : {self.zero_volume_rows}",
            f"missing-vol rows    : {self.missing_volume_rows}",
            f"invalid expiry rows : {self.invalid_expiry_rows}",
            f"dup business keys   : {self.duplicate_business_key_rows}",
            f"unique dates        : {', '.join(self.unique_trade_dates) or '-'}",
            f"unique symbols      : {len(self.unique_symbols)}",
            f"gold-family rows    : {self.gold_family_future_rows or '-'}",
        ]
        if self.rejected_by_reason:
            lines.append("rejection reasons   :")
            lines += [
                f"  {i.code}: {i.count} — {i.message}" for i in self.rejected_by_reason
            ]
        if self.flag_counts:
            lines.append("validation flags    :")
            lines += [f"  {i.code}: {i.count}" for i in self.flag_counts]
        return "\n".join(lines)
