"""Validated CSV ingestion for MCX bhavcopy files.

Rules (see docs/DATA_AUDIT.md, README §8):
- the source file is opened read-only and never modified;
- missing values stay null (missing ≠ 0); a reported zero volume is an
  observed value and is kept distinct from a missing volume;
- symbol whitespace is trimmed but the raw symbol is retained;
- trade/expiry dates are parsed strictly and every failure is reported;
- options/index contracts are normalized and counted, but excluded from the
  gold-futures analytics path — never silently dropped;
- provenance: source_file + source_row attached to every normalized record.
"""
from __future__ import annotations

import csv
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Tuple

from app.schemas.models import IngestIssue, IngestReport, NormalizedObservation, RejectedRow

REQUIRED_COLUMNS = [
    "Date",
    "Instrument Name",
    "Symbol",
    "Expiry Date",
    "Option Type",
    "Strike Price",
    "Open",
    "High",
    "Low",
    "Close",
    "Previous Close",
    "Volume(Lots)",
    "Volume(In 000's)",
    "Value(Lacs)",
    "Open Interest(Lots)",
]

FUTCOM = "FUTCOM"
OPTION_PATTERNS = ("OPTFUT", "OPTIDX")
INDEX_PATTERNS = ("FUTIDX", "OPTIDX")

# Gold-family symbols for *reporting purposes only*, observed in source data.
# This is not a statement of comparability, purity, or eligibility; verified
# contract specifications are owned by the contract registry (Phase 3+).
GOLD_FAMILY: tuple[str, ...] = ("GOLD", "GOLDM", "GOLDTEN", "GOLDGUINEA", "GOLDPETAL")

_DATE_FORMATS = ("%d %b %Y", "%d-%b-%Y", "%Y-%m-%d")
_EXPIRY_FORMATS = ("%d%b%Y", "%d %b %Y", "%Y-%m-%d")
_VOLUME_000S_RE = re.compile(r"^\s*([+-]?[0-9][0-9.,]*e?[+-]?[0-9]*)\s*(.*)\s*$")


class MissingColumnError(ValueError):
    """Raised when the source file lacks required columns."""

    def __init__(self, missing: list[str], provided: list[str]):
        self.missing = missing
        self.provided = provided
        super().__init__(
            f"source file missing required columns: {missing} (provided: {provided})"
        )


class InvalidCsvError(ValueError):
    """Raised when the file cannot be parsed as CSV at all."""


def _read_csv_lines(path: Path) -> list[str]:
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return path.read_text(encoding=encoding, errors="strict").splitlines()
        except UnicodeDecodeError:
            continue
    raise InvalidCsvError(f"cannot decode CSV as UTF-8/CP1252/Latin-1: {path}")


def read_rows(path: Path) -> list[dict[str, str]]:
    """Read all data rows, validating the header first. The file is never modified."""
    path = Path(path)
    lines = _read_csv_lines(path)
    if not lines:
        raise InvalidCsvError("source file is empty")
    reader = csv.DictReader(lines)
    if reader.fieldnames is None:
        raise InvalidCsvError("source file has no header row")
    header = [h.strip() for h in reader.fieldnames]
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        raise MissingColumnError(missing=missing, provided=header)
    return list(reader)


def parse_number(value: str | None) -> Tuple[float | None, bool]:
    """Parse a numeric CSV value -> (value or None, is_invalid).

    Empty/whitespace -> (None, False): missing, never 0.
    Unparsable text  -> (None, True). Thousands commas are tolerated.
    """
    if value is None:
        return None, False
    text = value.strip().replace(",", "")
    if text == "":
        return None, False
    try:
        return float(text), False
    except ValueError:
        return None, True


def parse_date(value: str | None) -> str | None:
    """Trade date (`16 Oct 2026` style) -> ISO date, or None."""
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_expiry(value: str | None) -> str | None:
    """Expiry (`30OCT2026` style) -> ISO date, or None."""
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    for fmt in _EXPIRY_FORMATS:
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_volume_in_000s(value: str | None) -> Tuple[float | None, str | None, bool]:
    """Split `Volume(In 000's)` (`5091.000 GRMS `) -> (number, unit, invalid).

    The unit string is preserved as reported; it is never converted and never
    inferred from the symbol (DATA_AUDIT limitation #2).
    """
    if value is None:
        return None, None, False
    text = value.strip()
    if not text:
        return None, None, False
    m = _VOLUME_000S_RE.match(text)
    if not m:
        return None, text, True  # wholly unparsable; raw string kept as unit
    number, num_invalid = parse_number(m.group(1))
    unit = m.group(2).strip()
    return number, (unit if unit else None), num_invalid


def build_contract_id(instrument_type: str, symbol: str, expiry_iso: str | None) -> str:
    """Stable internal identifier: FUTCOM_GOLD_20261204 (DATA_SCHEMA §3)."""
    suffix = expiry_iso.replace("-", "") if expiry_iso else "UNPARSED"
    return f"{instrument_type}_{symbol}_{suffix}"


def gold_futures_rows(observations: list[NormalizedObservation]) -> list[NormalizedObservation]:
    """FUTCOM rows of observed gold-family symbols, for the analytics path.

    Structural filter only. Liquidity and comparability vetting is quant-owned
    and happens downstream; nothing here maps a symbol to a specification.
    """
    gold = set(GOLD_FAMILY)
    return [o for o in observations if o.instrument_type == FUTCOM and o.symbol in gold]


def ingest_csv(
    path: Path | str,
) -> tuple[list[NormalizedObservation], list[RejectedRow], IngestReport]:
    """Ingest a bhavcopy CSV -> (normalized observations, rejected rows, report)."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"input CSV not found: {path}")

    rows = read_rows(path)

    ingested_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    observations: list[NormalizedObservation] = []
    rejected: list[RejectedRow] = []
    flag_counter: Counter[str] = Counter()
    reason_counter: Counter[str] = Counter()
    seen_business_keys: set[tuple] = set()
    duplicate_key_rows = 0

    for idx, row in enumerate(rows):
        source_row = idx + 1  # data-row numbering; physical CSV line = source_row + 1

        raw_symbol = row.get("Symbol") or ""
        symbol = raw_symbol.strip()
        instrument_type = (row.get("Instrument Name") or "").strip()

        trade_iso = parse_date(row.get("Date"))
        if trade_iso is None:
            reason_counter["INVALID_DATE"] += 1
            rejected.append(
                RejectedRow(
                    source_row=source_row,
                    raw_symbol=raw_symbol or None,
                    reason_code="INVALID_DATE",
                    reason=f"trade_date unparsable: {row.get('Date')!r}",
                )
            )
            continue

        flags: list[str] = []

        expiry_iso = parse_expiry(row.get("Expiry Date"))
        if expiry_iso is None and (row.get("Expiry Date") or "").strip():
            flags.append("INVALID_EXPIRY")
            flag_counter["INVALID_EXPIRY"] += 1

        business_key = (trade_iso, instrument_type, symbol, expiry_iso,
                        (row.get("Option Type") or "").strip() or None,
                        parse_number(row.get("Strike Price"))[0])
        if business_key in seen_business_keys:
            duplicate_key_rows += 1
            flags.append("DUPLICATE_KEY")
            flag_counter["DUPLICATE_KEY"] += 1
        else:
            seen_business_keys.add(business_key)

        if not symbol:
            flags.append("SYMBOL_BLANK")
            flag_counter["SYMBOL_BLANK"] += 1

        o, o_bad = parse_number(row.get("Open"))
        h, h_bad = parse_number(row.get("High"))
        low, low_bad = parse_number(row.get("Low"))
        close, close_bad = parse_number(row.get("Close"))
        prev_close, pc_bad = parse_number(row.get("Previous Close"))
        volume, vol_bad = parse_number(row.get("Volume(Lots)"))
        value_lacs, val_bad = parse_number(row.get("Value(Lacs)"))
        oi, oi_bad = parse_number(row.get("Open Interest(Lots)"))
        strike, strike_bad = parse_number(row.get("Strike Price"))

        if any((o_bad, h_bad, low_bad, close_bad, pc_bad, vol_bad, val_bad, oi_bad, strike_bad)):
            flags.append("INVALID_NUMBER")
            flag_counter["INVALID_NUMBER"] += 1

        volume_quantity, volume_unit, volume000_bad = parse_volume_in_000s(
            row.get("Volume(In 000's)")
        )
        if volume000_bad:
            flags.append("UNIT_UNPARSED")
            flag_counter["UNIT_UNPARSED"] += 1

        has_ohlc = all(x is not None for x in (o, h, low))
        if not has_ohlc:
            flags.append("MISSING_OHLC")
            flag_counter["MISSING_OHLC"] += 1
        if all(x is None for x in (o, h, low, close)):
            flags.append("ALL_PRICE_FIELDS_NULL")
            flag_counter["ALL_PRICE_FIELDS_NULL"] += 1

        zero_volume = volume is not None and volume == 0
        if zero_volume:
            flags.append("ZERO_VOLUME")
            flag_counter["ZERO_VOLUME"] += 1
            if close is not None:
                flags.append("STALE_PRICE")
                flag_counter["STALE_PRICE"] += 1
        if volume is None:
            flags.append("MISSING_VOLUME")
            flag_counter["MISSING_VOLUME"] += 1
        if oi is not None and oi == 0:
            flags.append("ZERO_OI")
        if oi is None:
            flags.append("MISSING_OI")
        if h is not None and low is not None and h < low:
            flags.append("INVALID_RANGE")
            flag_counter["INVALID_RANGE"] += 1

        if instrument_type in OPTION_PATTERNS or instrument_type in INDEX_PATTERNS:
            flags.append("UNSUPPORTED_INSTRUMENT")
            flag_counter["UNSUPPORTED_INSTRUMENT"] += 1

        observations.append(
            NormalizedObservation(
                contract_id=build_contract_id(instrument_type, symbol, expiry_iso),
                trade_date=trade_iso,
                symbol=symbol,
                symbol_raw=raw_symbol,
                instrument_type=instrument_type,
                expiry_date=expiry_iso,
                option_type=(row.get("Option Type") or "").strip() or None,
                strike_price=strike,
                open=o,
                high=h,
                low=low,
                close=close,
                previous_close=prev_close,
                settlement_price=None,  # no settlement column exists in this source
                volume_lots=volume,
                volume_quantity=volume_quantity,
                volume_unit=volume_unit,
                value_lacs=value_lacs,
                open_interest_lots=oi,
                has_ohlc=has_ohlc,
                zero_volume=zero_volume,
                is_tradable_candidate=has_ohlc and not zero_volume,
                source_file=path.name,
                source_row=source_row,
                ingested_at=ingested_at,
                validation_flags=flags,
            )
        )

    report = _build_report(
        input_file=path.name,
        rows=rows,
        observations=observations,
        rejected=rejected,
        reason_counter=reason_counter,
        flag_counter=flag_counter,
        duplicate_key_rows=duplicate_key_rows,
    )
    return observations, rejected, report


def _build_report(
    *,
    input_file: str,
    rows: list[dict[str, str]],
    observations: list[NormalizedObservation],
    rejected: list[RejectedRow],
    reason_counter: Counter[str],
    flag_counter: Counter[str],
    duplicate_key_rows: int = 0,
) -> IngestReport:
    futures = [o for o in observations if o.instrument_type == FUTCOM]
    options = [o for o in observations if o.instrument_type in OPTION_PATTERNS]
    index_rows = [o for o in observations if "IDX" in o.instrument_type]
    unsupported = options + [o for o in observations if o.instrument_type == "FUTIDX"]

    gold_counts = {
        symbol: sum(1 for o in futures if o.symbol == symbol)
        for symbol in GOLD_FAMILY
        if any(o.symbol == symbol for o in futures)
    }

    return IngestReport(
        input_file=input_file,
        input_row_count=len(rows),  # total data rows = accepted + rejected
        accepted_row_count=len(observations),
        rejected_row_count=len(rejected),
        futures_row_count=len(futures),
        options_row_count=len(options),
        index_rows_count=len(index_rows),
        unsupported_instrument_rows=len(unsupported),
        missing_ohlc_rows=sum(1 for o in observations if not o.has_ohlc),
        zero_volume_rows=sum(1 for o in observations if o.zero_volume),
        missing_volume_rows=sum(1 for o in observations if o.volume_lots is None),
        invalid_expiry_rows=flag_counter["INVALID_EXPIRY"],
        duplicate_business_key_rows=duplicate_key_rows,
        unique_trade_dates=sorted({o.trade_date for o in observations if o.trade_date}),
        unique_symbols=sorted({o.symbol for o in observations if o.symbol}),
        gold_family_future_rows=gold_counts,
        rejected_by_reason=[
            IngestIssue(code=code, count=count, message=code)
            for code, count in sorted(reason_counter.items())
        ],
        flag_counts=[
            IngestIssue(code=code, count=count, message=code)
            for code, count in sorted(flag_counter.items())
        ],
    )


def report_render(report: IngestReport, as_json: bool = False) -> str:
    """Format the report for the CLI."""
    if as_json:
        return json.dumps(report.model_dump(), indent=2)
    return report.render()
