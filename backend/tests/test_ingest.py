"""Phase 2 tests: validated CSV ingestion.

Covers the acceptance list from IMPLEMENTATION_PHASES_ARHM.txt PHASE 2:
valid input / missing column / malformed date / non-numeric / blank symbol /
missing OHLC / zero volume / option exclusion / provenance / stable re-ingestion.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.services.ingest import (
    InvalidCsvError,
    MissingColumnError,
    gold_futures_rows,
    ingest_csv,
)
from tests.conftest import HEADER, make_row, write_csv


def test_valid_input(tmp_path: Path):
    path = write_csv(
        tmp_path,
        [make_row(), make_row(Symbol="GOLDM        ", Expiry="05DEC2026")],
    )
    observations, rejected, report = ingest_csv(path)
    assert len(observations) == 2
    assert rejected == []
    assert report.accepted_row_count == 2
    assert report.rejected_row_count == 0

    gold = observations[0]
    assert gold.symbol == "GOLD"
    assert gold.symbol_raw == "GOLD         "  # raw retained untrimmed
    assert gold.trade_date == "2026-10-16"
    assert gold.expiry_date == "2026-12-04"
    assert gold.close == 147918.0
    assert gold.volume_lots == 5091.0
    assert gold.volume_quantity == 5091.0
    assert gold.volume_unit == "GRMS"          # unit separated from quantity
    assert gold.has_ohlc and gold.is_tradable_candidate
    assert not gold.zero_volume
    assert gold.validation_flags == []


def test_missing_required_column(tmp_path: Path):
    header = [c for c in HEADER if c != "Close"]
    path = write_csv(tmp_path, [make_row()], header=header, name="no_close.csv")
    with pytest.raises(MissingColumnError) as excinfo:
        ingest_csv(path)
    assert "Close" in excinfo.value.missing


def test_malformed_trade_date_rejected_and_reported(tmp_path: Path):
    path = write_csv(tmp_path, [make_row(Date="not-a-date"), make_row()])
    observations, rejected, report = ingest_csv(path)
    assert len(observations) == 1          # only the valid row normalized
    assert len(rejected) == 1
    assert rejected[0].reason_code == "INVALID_DATE"
    assert rejected[0].source_row == 1
    assert report.rejected_row_count == 1
    assert report.input_row_count == 2     # accepted + rejected


def test_malformed_expiry_retained_with_flag(tmp_path: Path):
    path = write_csv(tmp_path, [make_row(Expiry="32XYZ2026")])
    observations, _rejected, report = ingest_csv(path)
    row = observations[0]
    assert row.expiry_date is None
    assert "INVALID_EXPIRY" in row.validation_flags
    assert report.invalid_expiry_rows == 1
    assert "UNPARSED" in row.contract_id   # stable id survives missing expiry


def test_non_numeric_value_flagged(tmp_path: Path):
    path = write_csv(tmp_path, [make_row(Close="N.A."), make_row(Value="abc")])
    observations, _rejected, report = ingest_csv(path)
    assert observations[0].close is None          # missing stays missing, never 0
    assert observations[1].value_lacs is None
    reasons = [f.code for f in report.flag_counts]
    assert "INVALID_NUMBER" in reasons


def test_blank_symbol_flagged(tmp_path: Path):
    path = write_csv(tmp_path, [make_row(Symbol="   ")])
    observations, _rejected, report = ingest_csv(path)
    assert observations[0].symbol == ""
    assert observations[0].symbol_raw == "   "
    assert "SYMBOL_BLANK" in observations[0].validation_flags
    assert report.unique_symbols == []            # blank symbol not listed


def test_missing_ohlc_kept_null(tmp_path: Path):
    path = write_csv(
        tmp_path,
        [make_row(Open="", High="", Low="", Volume="0")],
    )
    observations, _rejected, report = ingest_csv(path)
    row = observations[0]
    assert row.open is None and row.high is None and row.low is None
    assert row.close == 147918.0                  # source reports a close
    assert not row.has_ohlc
    assert not row.is_tradable_candidate
    assert report.missing_ohlc_rows == 1
    assert "MISSING_OHLC" in row.validation_flags


def test_zero_volume_distinct_from_missing(tmp_path: Path):
    path = write_csv(tmp_path, [make_row(Volume="0")])
    observations, _r, report = ingest_csv(path)
    row = observations[0]
    assert row.zero_volume is True
    assert row.close == 147918.0
    assert not row.is_tradable_candidate
    assert "ZERO_VOLUME" in row.validation_flags
    assert "STALE_PRICE" in row.validation_flags  # populated close on zero volume
    assert report.zero_volume_rows == 1
    assert report.missing_volume_rows == 0

    path2 = write_csv(tmp_path, [make_row(Volume="")], name="missing_vol.csv")
    observations2, _r2, report2 = ingest_csv(path2)
    assert observations2[0].volume_lots is None
    assert observations2[0].zero_volume is False  # missing ≠ zero
    assert report2.missing_volume_rows == 1
    assert report2.zero_volume_rows == 0


def test_option_rows_not_on_gold_path(tmp_path: Path):
    rows = [
        make_row(),
        make_row(
            Instrument="OPTFUT",
            Symbol="GOLD        1",
            Expiry="05NOV2026",
            Option="CE",
            Strike="150000",
            Volume="0",
            Open="",
            High="",
            Low="",
        ),
        make_row(Instrument="FUTIDX", Symbol="MCXBULLDEX "),
    ]
    path = write_csv(tmp_path, rows)
    observations, _rejected, report = ingest_csv(path)
    gold_path = gold_futures_rows(observations)
    assert {o.symbol for o in gold_path} == {"GOLD"}  # option/index excluded
    assert report.options_row_count == 1
    assert report.unsupported_instrument_rows == 2
    flags = [o.validation_flags for o in observations if o.instrument_type != "FUTCOM"]
    assert all("UNSUPPORTED_INSTRUMENT" in f for f in flags)


def test_provenance_retained(tmp_path: Path):
    path = write_csv(tmp_path, [make_row(), make_row()])
    observations, _r, _report = ingest_csv(path)
    for i, o in enumerate(observations, start=1):
        assert o.source_row == i          # 1-based data-row numbering
        assert o.source_file == "sample.csv"
        assert o.ingested_at              # UTC ISO timestamp present


def test_repeat_ingestion_stable(tmp_path: Path):
    path = write_csv(
        tmp_path,
        [make_row(), make_row(Volume="0", Open="", High="", Low="")],
    )
    obs1, _rej1, rep1 = ingest_csv(path)
    obs2, _rej2, rep2 = ingest_csv(path)
    d1 = [o.model_dump(exclude={"ingested_at"}) for o in obs1]
    d2 = [o.model_dump(exclude={"ingested_at"}) for o in obs2]
    assert d1 == d2                        # deterministic normalized records


def test_empty_file_detected(tmp_path: Path):
    target = tmp_path / "empty.csv"
    target.write_text("", encoding="utf-8")
    with pytest.raises(InvalidCsvError):
        ingest_csv(target)


def test_real_supplied_file_if_present():
    """Integration smoke against the supplied CSV (skipped if not found)."""
    real = Path(__file__).resolve().parents[2] / "BhavCopyDateWise_16102026 (2).csv"
    if not real.exists():
        pytest.skip("supplied CSV not present")
    observations, _rejected, report = ingest_csv(real)
    assert report.input_row_count == 15535
    assert report.accepted_row_count == 15535
    assert report.rejected_row_count == 0
    assert report.futures_row_count == 168
    assert report.options_row_count == 15360
    assert report.unique_trade_dates == ["2026-10-16"]
    assert report.gold_family_future_rows == {
        "GOLD": 6, "GOLDM": 6, "GOLDTEN": 6, "GOLDGUINEA": 6, "GOLDPETAL": 6,
    }
    assert report.missing_ohlc_rows == 14592
    assert report.zero_volume_rows == 14592
    gold = gold_futures_rows(observations)
    dec = [o for o in gold if o.symbol == "GOLD" and o.expiry_date == "2026-12-04"][0]
    assert dec.close == 147918.0 and dec.volume_lots == 5091.0
    assert dec.open is not None and dec.has_ohlc is True  # traded GOLD Dec row
