"""Phase 5 tests: FastAPI endpoints against the shared API contract."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.main import app
from app.services.ingest import ingest_csv
from app.storage.database import GoldlensDB
from tests.conftest import make_row, write_csv

PAIR_ID = "GOLDM_near20261204_far20270105"


def _seeded_client(tmp_path: Path, monkeypatch, rows: list[list[str]] | None) -> TestClient:
    db_path = tmp_path / "processed" / "api.duckdb"
    if rows is not None:
        src = write_csv(tmp_path, rows)
        observations, _rejected, report = ingest_csv(src)
        with GoldlensDB(db_path) as db:
            db.store_ingest(observations, report)

    @lru_cache(maxsize=1)
    def _factory() -> GoldlensDB:
        return GoldlensDB(db_path)

    monkeypatch.setattr(deps, "get_db", _factory)
    return TestClient(app)


@pytest.fixture()
def client_goldm(tmp_path: Path, monkeypatch) -> TestClient:
    """GOLDM two legs on one date (near Dec-04 tradable, far Jan-05 tradable)."""
    rows = [
        make_row(Symbol="GOLDM        ", Expiry="04DEC2026"),
        make_row(Symbol="GOLDM        ", Expiry="05JAN2027", High="150000", Low="148000", Volume="200"),
    ]
    return _seeded_client(tmp_path, monkeypatch, rows)


def test_health_endpoint(client_goldm: TestClient):
    resp = client_goldm.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"
    assert body["data_available"] is True
    assert body["distinct_trade_dates"] == 1
    assert body["latest_data_date"] == "2026-10-16"


def test_contracts_endpoint(client_goldm: TestClient):
    resp = client_goldm.get("/api/contracts")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    const = body["contracts"][0]
    assert const["verification_status"] == "unverified"
    assert const["contract_size"] is None            # no guessed specs
    assert const["verified_fields"] == []
    # symbol filter
    resp2 = client_goldm.get("/api/contracts", params={"symbol": "GOLDM"})
    assert resp2.json()["count"] == 2


def test_pairs_endpoint_lists_candidate(client_goldm: TestClient):
    resp = client_goldm.get("/api/pairs")
    assert resp.status_code == 200
    body = resp.json()
    ids = [p["pair_id"] for p in body["pairs"]]
    assert PAIR_ID in ids
    pair = body["pairs"][ids.index(PAIR_ID)]
    assert pair["status"] == "candidate_only"
    assert "UNVERIFIED_SPEC" in pair["reason_codes"]
    assert pair["symbol"] == "GOLDM"
    assert pair["history_days"] == 1


def test_pair_history_single_reference_row(client_goldm: TestClient):
    resp = client_goldm.get(f"/api/pairs/{PAIR_ID}/history")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 1
    obs = body["observations"][0]
    assert obs["trade_date"] == "2026-10-16"
    assert obs["spread"] is not None
    assert obs["spread"] == abs(obs["near_close"] - obs["far_close"]) or obs["spread"] == obs["near_close"] - obs["far_close"]
    # only one date -> explicit warning, never claimed as series
    assert any(w["code"] == "INSUFFICIENT_HISTORY" for w in body["warnings"])


def test_signal_analyze_no_trade(client_goldm: TestClient):
    resp = client_goldm.post("/api/signals/analyze", json={"pair_id": PAIR_ID})
    assert resp.status_code == 200
    body = resp.json()
    assert body["pair_id"] == PAIR_ID
    assert body["as_of_date"] == "2026-10-16"
    assert body["decision"] == "NO_TRADE"
    assert "INSUFFICIENT_HISTORY" in body["reason_codes"]
    assert body["z_score"] is None
    assert body["gross_edge"] is None
    assert body["estimated_cost"] is None
    assert body["net_edge"] is None
    assert body["spread"] is not None                 # reference spread is fine
    dq = body["data_quality"]
    assert dq["distinct_trade_dates"] == 1
    assert dq["trading_days_available"] == 1
    assert any(w["code"] == "INSUFFICIENT_HISTORY" for w in dq["warnings"])


def test_signal_analyze_unknown_date(client_goldm: TestClient):
    resp = client_goldm.post(
        "/api/signals/analyze", json={"pair_id": PAIR_ID, "as_of_date": "2025-01-01"}
    )
    body = resp.json()
    assert "DATE_NOT_IN_DATA" in body["reason_codes"]


def test_signal_analyze_bad_pair_id(client_goldm: TestClient):
    resp = client_goldm.post("/api/signals/analyze", json={"pair_id": "nonsense"})
    assert resp.status_code == 404
    body = resp.json()
    assert body["error"]["code"] == "not_found"       # contract error shape


def test_backtest_refused(client_goldm: TestClient):
    resp = client_goldm.post(
        "/api/backtests/run",
        json={"pair_id": PAIR_ID, "start_date": "2026-10-16", "end_date": "2026-10-16"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["runnable"] is False
    assert body["observation_count"] == 1
    assert body["completed_trades"] == 0
    assert body["gross_pnl"] is None
    assert body["estimated_costs"] is None
    assert body["net_pnl"] is None
    assert body["max_drawdown"] is None
    assert any(w["code"] == "INSUFFICIENT_HISTORY" for w in body["warnings"])
    assert body["strategy_version"] == "default"
    assert body["evaluation_period"]["start_date"] == "2026-10-16"


def test_endpoints_on_empty_db(tmp_path: Path, monkeypatch):
    client = _seeded_client(tmp_path, monkeypatch, None)

    resp = client.get("/api/health")
    assert resp.json() == {
        "status": "healthy",
        "service": "goldlens-backend",
        "version": resp.json()["version"],
        "data_available": False,
        "distinct_trade_dates": 0,
        "latest_data_date": None,
    } or resp.json()["data_available"] is False

    pairs = client.get("/api/pairs").json()
    assert pairs["pairs"] == []
    assert any(w["code"] == "NO_DATA" for w in pairs["warnings"])

    hist = client.get(f"/api/pairs/{PAIR_ID}/history")
    assert hist.status_code == 200
    assert hist.json()["observations"] == []

    sig = client.post("/api/signals/analyze", json={"pair_id": PAIR_ID})
    assert sig.json()["decision"] == "NO_TRADE"
    sig2 = client.post("/api/signals/analyze", json={"pair_id": PAIR_ID})
    assert sig2.json()["spread"] is None

    bt = client.post("/api/backtests/run", json={"pair_id": PAIR_ID}).json()
    assert bt["runnable"] is False and bt["observation_count"] == 0

    dq = client.get("/api/data-quality").json()
    assert any(i["code"] == "NO_DATA" for i in dq["issues"])


def test_openapi_loads_and_documents_routes(client_goldm: TestClient):
    resp = client_goldm.get("/openapi.json")
    assert resp.status_code == 200
    paths = resp.json()["paths"]
    for route in (
        "/api/health",
        "/api/contracts",
        "/api/pairs",
        f"/api/pairs/{{pair_id}}/history",
        "/api/signals/analyze",
        "/api/backtests/run",
        "/api/data-quality",
        "/api/ingest",
    ):
        assert route in paths, f"missing route {route}"
