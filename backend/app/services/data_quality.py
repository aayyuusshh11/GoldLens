"""Data-quality service (Phase 4).

Builds the report from REAL stored data only. No silent repair, no synthetic
fills: every observed problem becomes an issue with count + reason code.
Cardinal rules encoded here:
- zero volume and missing volume are reported separately;
- one distinct date is never presented as multi-day history;
- contract spec verification status is always visible;
- missing settlement is structural (no settlement column in this source).
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.config import (
    MIN_TRADE_DATES_FOR_BACKTEST,
    MIN_TRADE_DATES_FOR_SIGNAL,
)
from app.schemas.data_quality import (
    ContractSpecVerification,
    DataQualityIssue,
    DataQualityReport,
    HistorySufficiency,
    RowsTotals,
    SourceStatus,
)
from app.storage.database import GoldlensDB


def build_data_quality(db: GoldlensDB) -> DataQualityReport:
    counts = db.quality_counts()
    verification = db.verification_counts()
    contract_total = db.contract_total()
    dates = db.distinct_trade_dates()
    sources_raw = db.ingest_run_history()
    duplicates = db.duplicate_business_key_rows()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    issues: list[DataQualityIssue] = []

    def add(code: str, severity: str, count: int, message: str) -> None:
        issues.append(
            DataQualityIssue(code=code, severity=severity, count=count, message=message)
        )

    if counts["total_rows"] == 0:
        add(
            "NO_DATA",
            "critical",
            0,
            "no observations stored — ingest the supplied CSV first (POST /api/ingest or CLI `python -m app.cli ingest`)",
        )
    else:
        min_date, max_date = counts["min_date"], counts["max_date"]
        add("ZERO_VOLUME_ROWS", "warning", counts["zero_volume_rows"],
            "rows report Volume(Lots)=0; populated closes on these rows are reference values, not tradable quotes")
        add("MISSING_VOLUME_ROWS", "warning", counts["missing_volume_rows"],
            "rows with no volume observation (distinct from zero volume — never conflate)")
        add("MISSING_OHLC_ROWS", "warning", counts["missing_ohlc_rows"],
            "missing open/high/low; close may still be populated on these rows")
        add("MISSING_SETTLEMENT_ROWS", "critical", counts["total_rows"],
            "source has no settlement-price column; settlement unavailable for every row")
        add("ZERO_OI_ROWS", "info", counts["zero_oi_rows"],
            "rows reporting open interest 0")
        add("MISSING_OI_ROWS", "info", counts["missing_oi_rows"],
            "rows with no open-interest observation")
        add("INVALID_OHLC_RANGE_ROWS", "error", counts["invalid_range_rows"],
            "high below low (or structurally invalid range)")
        add(
            "DUPLICATE_BUSINESS_KEYS",
            "error" if duplicates else "info",
            duplicates,
            "rows beyond the first sharing (trade_date, instrument, symbol, expiry, option_type, strike_price); storage keeps first occurrence — see ingest report for file-level counts",
        )
        add("UNSUPPORTED_INSTRUMENT_ROWS", "info", counts["unsupported_rows"],
            "rows excluded from the gold-futures analytics path (options/index contracts); retained and counted, never silently dropped")
        add("NO_UNIT_ROWS", "warning", counts["no_unit_rows"],
            "volume-quantity parsed without unit token")

        unverified = verification.get("unverified", 0)
        add("CONTRACT_SPECS_UNVERIFIED", "warning", unverified,
            "contract registry entries whose size/purity/quotation/tick/expiry-rule are unverified by an authoritative source; known values stay null")

    suffices_signal = counts["distinct_dates"] >= MIN_TRADE_DATES_FOR_SIGNAL
    suffices_backtest = counts["distinct_dates"] >= MIN_TRADE_DATES_FOR_BACKTEST
    sufficiency = HistorySufficiency(
        distinct_trade_dates=counts["distinct_dates"],
        minimum_required=min(MIN_TRADE_DATES_FOR_SIGNAL, MIN_TRADE_DATES_FOR_BACKTEST),
        sufficient_for_signal=suffices_signal,
        sufficient_for_backtest=suffices_backtest,
    )
    if counts["total_rows"]:
        if not suffices_backtest:
            add(
                "INSUFFICIENT_HISTORY",
                "error",
                counts["distinct_dates"],
                f"{counts['distinct_dates']} distinct trading date(s) ({counts['min_date']}..{counts['max_date']}) is below the {MIN_TRADE_DATES_FOR_BACKTEST}-date minimum: rolling z-scores, walk-forward backtesting and performance claims are refused",
            )

    sources = [
        SourceStatus(
            file=s["source_file"],
            ingested_at=str(s["ingested_at"]),
            input_rows=int(s["input_row_count"]),
            accepted_rows=int(s["accepted_rows"]),
            rejected_rows=int(s["rejected_rows"]),
            observations_inserted=int(s["observations_inserted"]),
            observations_skipped=int(s["observations_skipped"]),
            status="ingested",
        )
        for s in sources_raw
    ]
    rejected_total = sum(s.rejected_rows for s in sources)

    return DataQualityReport(
        generated_at=now,
        sources=sources,
        rows=RowsTotals(
            total=counts["total_rows"],
            futcom_rows=counts["futcom_rows"],
            options_rows=counts["option_rows"],
            futidx_rows=counts["futidx_rows"],
            rejected_rows=rejected_total,
        ),
        dates_available=dates,
        issues=issues,
        contract_spec_verification=ContractSpecVerification(
            verified=verification.get("verified", 0),
            unverified=verification.get("unverified", 0),
            conflicting=verification.get("conflicting", 0),
        ),
        history_sufficiency=sufficiency,
    )
