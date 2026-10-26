"""Phase 4 tests: data-quality service + endpoint."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.main import app
from app.services.data_quality import build_data_quality
from app.services.ingest import ingest_csv
from app.storage.database import GoldlensDB
from tests.conftest import make_row, write_csv


def _make_client(tmp_path: Path, monkeypatch, rows: list[list[str]]) -> TestClient:
    """App with an isolated test DB seeded from synthetic rows."""
    db_path = tmp_path / "processed" / "dq.duckdb"
    observations, _rejected, report = ingest_csv_from_rows(tmp_path, rows)
    with GoldlensDB(db_path) as db:
        db.store_ingest(observations, report)

    @lru_cache(maxsize=1)
    def _factory() -> GoldlensDB:
        return GoldlensDB(db_path)

    monkeypatch.setattr(deps, "get_db", _factory)
    return TestClient(app)


def ingest_csv_from_rows(tmp_path: Path, rows: list[list[str]]):
    src = write_csv(tmp_path, rows)
    return ingest_csv(src)


@pytest.mark.parametrize(
    "rows",
    [[
        make_row(),
        make_row(Expiry="05DEC2026", Volume="0", Open="", High="", Low=""),
        make_row(Expiry="05JAN2027", Volume="", Open="", High="", Low="", Close=""),
    ]],
)
def test_zero_and_missing_volume_reported_separately(tmp_path, monkeypatch, rows):
    _ = _make_client(tmp_path, monkeypatch, rows)
    db_path = tmp_path / "processed" / "dq.duckdb"
    with GoldlensDB(db_path) as db:
        report = build_data_quality(db)
    codes = {i.code: i for i in report.issues}
    assert codes["ZERO_VOLUME_ROWS"].count == 1
    assert codes["MISSING_VOLUME_ROWS"].count == 1
    # distinct codes: zero volume ≠ missing volume, never conflated
    assert codes["ZERO_VOLUME_ROWS"].code != codes["MISSING_VOLUME_ROWS"].code


def test_one_date_never_claims_history(tmp_path, monkeypatch):
    _ = _make_client(
        tmp_path,
        monkeypatch,
        [make_row(), make_row(Expiry="05DEC2026", Volume="0", Open="", High="", Low="")],
    )
    db_path = tmp_path / "processed" / "dq.duckdb"
    with GoldlensDB(db_path) as db:
        report = build_data_quality(db)
    assert report.history_sufficiency.distinct_trade_dates == 1
    assert report.history_sufficiency.sufficient_for_signal is False
    assert report.history_sufficiency.sufficient_for_backtest is False
    insuff = [i for i in report.issues if i.code == "INSUFFICIENT_HISTORY"]
    assert len(insuff) == 1 and insuff[0].severity == "error"
    assert report.dates_available == ["2026-10-16"]


def test_contract_spec_verification_visible(tmp_path, monkeypatch):
    _ = _make_client(
        tmp_path,
        monkeypatch,
        [
            make_row(),
            make_row(Symbol="GOLDM        ", Expiry="05DEC2026"),
        ],
    )
    db_path = tmp_path / "processed" / "dq.duckdb"
    with GoldlensDB(db_path) as db:
        report = build_data_quality(db)
    ver = report.contract_spec_verification
    assert (ver.verified, ver.unverified, ver.conflicting) == (0, 2, 0)
    sev = {i.code: i.severity for i in report.issues}
    assert sev["CONTRACT_SPECS_UNVERIFIED"] == "warning"
    assert sev["MISSING_SETTLEMENT_ROWS"] == "critical"
    assert sev["INVALID_OHLC_RANGE_ROWS"] == "error"


def test_report_stable_between_calls(tmp_path, monkeypatch):
    _ = _make_client(tmp_path, monkeypatch, [make_row()])
    db_path = tmp_path / "processed" / "dq.duckdb"
    with GoldlensDB(db_path) as db:
        r1 = build_data_quality(db).model_dump()
        r2 = build_data_quality(db).model_dump()
    r1.pop("generated_at")
    r2.pop("generated_at")
    assert r1 == r2


def test_empty_database_reports_no_data(tmp_path: Path):
    with GoldlensDB(tmp_path / "empty.duckdb") as db:
        report = build_data_quality(db)
    codes = [i.code for i in report.issues]
    assert "NO_DATA" in codes
    assert "INSUFFICIENT_HISTORY" not in codes   # nothing analyzed, nothing claimed
    assert report.rows.total == 0


def test_data_quality_endpoint(tmp_path, monkeypatch):
    client = _make_client(
        tmp_path,
        monkeypatch,
        [make_row(), make_row(Expiry="05DEC2026", Volume="0", Open="", High="", Low="")],
    )
    resp = client.get("/api/data-quality")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["rows"]["total"] == 2
    assert payload["history_sufficiency"]["sufficient_for_backtest"] is False
    assert any(i["code"] == "INSUFFICIENT_HISTORY" for i in payload["issues"])
    assert payload["contract_spec_verification"]["unverified"] == 2
    assert payload["sources"][0]["status"] == "ingested"
    assert payload["sources"][0]["input_rows"] == 2


def test_endpoint_openapi_documented(tmp_path, monkeypatch):
    client = _make_client(tmp_path, monkeypatch, [make_row()])
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    assert "/api/data-quality" in resp.json()["paths"]
