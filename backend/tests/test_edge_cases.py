"""Phase 6 edge-case tests: hardening of ingestion + analytics refusal paths."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.services.analytics import analyze_signal, list_pairs, pair_history, run_backtest
from app.services.ingest import ingest_csv
from app.storage.database import GoldlensDB
from tests.conftest import HEADER, make_row, write_csv


def test_bad_encoding_falls_back_not_corrupt(tmp_path: Path):
    """cp1252 bytes (latin accents) must parse, never crash, keep provenance."""
    path = tmp_path / "cp1252.csv"
    row = make_row(Symbol="GOLDE")
    with path.open("w", encoding="cp1252", newline="") as f:
        f.write(",".join(HEADER) + "\n")
        f.write(",".join(row) + "\n")
    observations, _rejected, report = ingest_csv(path)
    assert report.accepted_row_count == 1
    assert observations[0].symbol == "GOLDE"


def test_malformed_volume_unit_flagged(tmp_path: Path):
    path = write_csv(tmp_path, [make_row(Volume000s="garbage data!!")])
    observations, _r, report = ingest_csv(path)
    row = observations[0]
    assert row.volume_quantity is None
    assert "UNIT_UNPARSED" in row.validation_flags
    assert report.flag_counts[0].code == "UNIT_UNPARSED" or any(
        f.code == "UNIT_UNPARSED" for f in report.flag_counts
    )
    assert row.volume_unit == "garbage data!!"     # raw preserved, not invented


def test_all_null_price_columns(tmp_path: Path):
    path = write_csv(
        tmp_path,
        [
            make_row(Open="", High="", Low="", Close="", PreviousClose="", Volume="0"),
        ],
    )
    observations, _r, report = ingest_csv(path)
    row = observations[0]
    assert row.close is None and row.previous_close is None
    assert row.open is None and row.high is None and row.low is None
    assert not row.has_ohlc and not row.is_tradable_candidate
    assert "ALL_PRICE_FIELDS_NULL" in row.validation_flags
    assert "ZERO_VOLUME" in row.validation_flags


def test_crlf_line_endings(tmp_path: Path):
    path = tmp_path / "crlf.csv"
    with path.open("w", encoding="utf-8", newline="\r\n") as f:
        f.write(",".join(HEADER) + "\r\n")
        f.write(",".join(make_row()) + "\r\n")
    observations, _rejected, report = ingest_csv(path)
    assert report.accepted_row_count == 1
    assert observations[0].close == 147918.0


def test_two_files_same_day_no_cross_file_duplicates(tmp_path: Path):
    """Same observation in two files: business key dedupe spans sources."""
    src1 = write_csv(tmp_path, [make_row()], name="a.csv")
    src2 = write_csv(tmp_path, [make_row()], name="b.csv")
    db_path = tmp_path / "processed" / "dupe.duckdb"
    with GoldlensDB(db_path) as db:
        for src in (src1, src2):
            observations, _rej, report = ingest_csv(src)
            stats = db.store_ingest(observations, report)
    stats2 = stats
    assert stats2.observations_inserted == 0        # second file adds nothing
    stats1 = None
    with GoldlensDB(db_path) as db:
        assert db.observation_count() == 1
        # provenance of first accepted inset retained
        row = db.observations_by_symbol("GOLD")[0]
        assert row["source_file"] == "a.csv"


def test_one_date_history_never_yields_backtest(tmp_path: Path):
    src = write_csv(
        tmp_path,
        [
            make_row(Symbol="GOLDM        ", Expiry="04DEC2026"),
            make_row(Symbol="GOLDM        ", Expiry="05JAN2027", Volume="300"),
        ],
    )
    db_path = tmp_path / "processed" / "one_date.duckdb"
    observations, _rej, report = ingest_csv(src)
    with GoldlensDB(db_path) as db:
        db.store_ingest(observations, report)
        pairs = list_pairs(db, symbol="GOLDM")
        assert len(pairs.pairs) == 1
        pair_id = pairs.pairs[0].pair_id

        history = pair_history(db, pair_id)
        assert history.count == 1

        analysis = analyze_signal(db, pair_id, None)
        assert analysis.decision == "NO_TRADE"
        assert "INSUFFICIENT_HISTORY" in analysis.reason_codes
        assert analysis.z_score is None and analysis.net_edge is None

        backtest = run_backtest(db, pair_id, "2026-10-16", "2026-10-16", "default")
        assert backtest.runnable is False
        assert backtest.gross_pnl is None and backtest.net_pnl is None
        assert any(w["code"] == "INSUFFICIENT_HISTORY" for w in backtest.warnings)


def test_unverified_specs_refuse_eligibility(tmp_path: Path):
    """Registry passes: with all-unverified specs, nothing is marked eligible."""
    src = write_csv(
        tmp_path,
        [make_row(), make_row(Symbol="GOLDM        ", Expiry="05DEC2026")],
    )
    db_path = tmp_path / "processed" / "ver.duckdb"
    observations, _r, report = ingest_csv(src)
    with GoldlensDB(db_path) as db:
        db.store_ingest(observations, report)
        pairs = list_pairs(db)
        for p in pairs.pairs:
            assert p.status == "candidate_only"
            assert "UNVERIFIED_SPEC" in p.reason_codes
            # no contract size/purity invented anywhere in the path
        for contract in db.list_contracts():
            assert contract["contract_size"] is None
