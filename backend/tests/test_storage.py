"""Phase 3 tests: DuckDB storage + contract registry."""
from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path

import pytest

from app.services.ingest import ingest_csv
from app.storage.database import GoldlensDB
from tests.conftest import make_row, write_csv


@pytest.fixture()
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "processed" / "test.duckdb"


def _ingest_file(path: Path, db_path: Path):
    observations, _rejected, report = ingest_csv(path)
    with GoldlensDB(db_path) as db:
        stats = db.store_ingest(observations, report)
    return observations, report, stats


@contextmanager
def _source_integrity(src: Path):
    """Assert the source CSV stays byte-identical across the block."""
    before = src.read_bytes()
    try:
        yield
    finally:
        assert src.read_bytes() == before, "source file modified!"


def test_repeat_ingestion_is_idempotent(db_path: Path, tmp_path: Path):
    src = write_csv(
        tmp_path,
        [
            make_row(),
            make_row(Expiry="05DEC2026", Volume="0", Open="", High="", Low=""),
        ],
    )
    with _source_integrity(src):
        _obs1, _rep1, stats1 = _ingest_file(src, db_path)
        _obs2, _rep2, stats2 = _ingest_file(src, db_path)

    assert stats1.observations_inserted == 2
    assert stats2.observations_inserted == 0        # no duplicates on re-run
    assert stats2.observations_skipped == 2
    with GoldlensDB(db_path) as db:
        assert db.observation_count() == 2


def test_duplicate_rows_within_same_file_deduplicated(db_path: Path, tmp_path: Path):
    # rows 1-3 share ONE business key (OHLC/volume are not part of the key)
    src = write_csv(
        tmp_path,
        [make_row(), make_row(), make_row(Volume="0", Open="", High="", Low="")],
    )
    observations, _rejected, report = ingest_csv(src)
    assert report.duplicate_business_key_rows == 2   # rows 2 and 3 repeat the key
    dup_flagged = [o for o in observations if "DUPLICATE_KEY" in o.validation_flags]
    assert len(dup_flagged) == 2

    with GoldlensDB(db_path) as db:
        stats = db.store_ingest(observations, report)
    assert stats.observations_inserted == 1          # unique business keys only
    assert stats.observations_skipped == 2
    with GoldlensDB(db_path) as db:
        assert db.duplicate_business_key_rows() == 0  # DB stores no duplicates


def test_nullable_values_stay_null_in_db(db_path: Path, tmp_path: Path):
    src = write_csv(tmp_path, [make_row(Volume="0", Open="", High="", Low="")])
    _obs, _rep, _stats = _ingest_file(src, db_path)
    with GoldlensDB(db_path) as db:
        row = db.observations_by_symbol("GOLD")[0]
        assert row["open"] is None and row["high"] is None and row["low"] is None
        assert row["close"] == 147918.0             # populated close retained
        assert row["settlement_price"] is None      # never fabricated
        assert row["zero_volume"] is True           # zero ≠ missing
        assert row["volume_lots"] == 0.0


def test_raw_source_file_never_modified(db_path: Path, tmp_path: Path):
    src = write_csv(tmp_path, [make_row()])
    with _source_integrity(src):
        _ingest_file(src, db_path)


def test_registry_provenance_and_no_guessed_specs(db_path: Path, tmp_path: Path):
    src = write_csv(
        tmp_path,
        [make_row(), make_row(Symbol="GOLDM        ", Expiry="05DEC2026")],
    )
    _obs, _rep, stats = _ingest_file(src, db_path)
    assert stats.contracts_inserted == 2
    with GoldlensDB(db_path) as db:
        contracts = db.list_contracts()
        assert len(contracts) == 2
        for c in contracts:
            assert c["contract_size"] is None       # never guessed from symbol
            assert c["units"] is None
            assert c["quotation_unit"] is None
            assert c["purity"] is None
            assert c["tick_size"] is None
            assert c["expiry_rule"] is None
            assert c["verification_status"] == "unverified"
            assert c["verified_fields"] == []
        assert db.contracts_needing_verification()[0]["symbol"] in ("GOLD", "GOLDM")
        assert db.verification_counts()["unverified"] == 2


def test_verification_requires_source(db_path: Path, tmp_path: Path):
    src = write_csv(tmp_path, [make_row()])
    _ingest_file(src, db_path)
    with GoldlensDB(db_path) as db:
        with pytest.raises(ValueError):
            db.verify_contract_fields("FUTCOM_GOLD_20261204", {"contract_size": 1000.0}, source="")
        with pytest.raises(ValueError):
            db.verify_contract_fields(
                "FUTCOM_GOLD_20261204", {"not_a_field": 1}, source="someone"
            )

        ok = db.verify_contract_fields(
            "FUTCOM_GOLD_20261204",
            {"contract_size": 1000.0, "units": "KG"},
            source="mcx-india contract info 2026-10-18",
            effective_from="2026-10-01",
        )
        assert ok
        c = [
            x for x in db.list_contracts(symbol="GOLD")
            if x["contract_id"] == "FUTCOM_GOLD_20261204"
        ][0]
        assert c["verification_status"] == "verified"
        assert c["verified_fields"] == ["contract_size", "units"]
        assert c["source"]
        assert c["verification_timestamp"]
        assert c["effective_from"] == "2026-10-01"
        assert db.verification_counts()["verified"] == 1


def test_registry_observed_dates_track_newer_data(db_path: Path, tmp_path: Path):
    src1 = write_csv(tmp_path, [make_row()])
    src2 = write_csv(tmp_path, [make_row(Date="17 Oct 2026")], name="second_day.csv")
    _ingest_file(src1, db_path)
    _ingest_file(src2, db_path)
    with GoldlensDB(db_path) as db:
        c = db.list_contracts(symbol="GOLD")[0]
        assert c["first_observed_date"] == "2026-10-16"
        assert c["last_observed_date"] == "2026-10-17"
        assert db.distinct_trade_dates() == ["2026-10-16", "2026-10-17"]


def test_rebuild_from_input_reproduces_identical_content(db_path: Path, tmp_path: Path):
    src = write_csv(
        tmp_path,
        [
            make_row(),
            make_row(Expiry="05DEC2026", Volume="0", Open="", High="", Low=""),
            make_row(Symbol="GOLDM        ", Expiry="05DEC2026"),
        ],
    )
    _obs_a, _rep_a, _s1 = _ingest_file(src, db_path)

    db_path2 = db_path.with_name("rebuild.duckdb")   # fresh DB, same input
    _obs_b, _rep_b, _s2 = _ingest_file(src, db_path2)

    def _dump(db: GoldlensDB) -> list[dict]:
        out = []
        for sym in ("GOLD", "GOLDM"):
            for r in db.observations_by_symbol(sym):
                r.pop("ingested_at", None)           # metadata, not data
                out.append(r)
        out.sort(key=lambda d: (d["symbol"], d["expiry_date"] or "", d["source_row"]))
        return out

    with GoldlensDB(db_path) as db1, GoldlensDB(db_path2) as db2:
        assert db1.observation_count() == db2.observation_count() == 3
        assert db1.contract_total() == db2.contract_total() == 3
        assert _dump(db1) == _dump(db2)
