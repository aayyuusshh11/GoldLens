"""Phase 1-3 ingestion tests: downloader (fake transport), validation,
conflict-aware dedup, readiness gates. No live network in unit tests; the
one live accessibility probe is manual evidence recorded separately.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import pandas as pd
import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from quant.data import load_bhavcopy
from quant.ingestion import historical_downloader as hd
from quant.ingestion import readiness, validation
from quant.ingestion.validation import IngestionError


# ---------------------------------------------------------------- fake transport

PAGE = b'<!doctype html><html><input type="hidden" name="__RequestVerificationToken" value="T0K3N"></html>'

GOOD_PAYLOAD = json.dumps({
    "Data": [
        {"Date": "2026-01-05", "InstrumentName": "FUTCOM", "Symbol": "GOLD",
         "ExpiryDate": "05FEB2026", "Open": "100000", "High": "100500",
         "Low": "99500", "Close": "100200", "PCP": "100000",
         "svolume": "1500", "Value": "15000", "OpenInterest": "9000"},
    ] * 3
}).encode()


def make_fetcher(page=PAGE, body=GOOD_PAYLOAD, code=200):
    calls = {"n": 0}

    def fetcher(url, timeout=10.0, extra_headers=None):
        calls["n"] += 1
        if url.endswith("/market-data/bhavcopy"):
            return 200, page, {"content-type": "text/html"}
        return code, body, {"content-type": "application/json"}

    fetcher.calls = calls  # type: ignore[attr-defined]
    return fetcher


def run(client_tmp: Path, fetcher, start="2026-01-05", end="2026-01-07", dry_run=False):
    src = hd.McxSource(fetcher=fetcher, rate_limit_s=0.0)
    return hd.download(start, end, client_tmp, source=src, dry_run=dry_run)


# ---------------------------------------------------------------- downloader

def test_downloader_dry_run_plans_without_writing(tmp_path):
    res = run(tmp_path, make_fetcher(), dry_run=True)
    assert res["dry_run"] is True
    assert res["summary"]["requested"] == 3  # Mon-Wed 2026-01-05..07
    assert all(a["status"] == "planned" for a in
               json.loads((tmp_path / "manifest_download.json").read_text())["attempts"])
    assert not list(tmp_path.glob("bhavcopy_*.json"))


def test_downloader_downloads_and_records_checksum(tmp_path):
    res = run(tmp_path, make_fetcher())
    assert res["summary"]["downloaded"] == 3
    f = tmp_path / "bhavcopy_20260105.json"
    assert f.exists()
    man = json.loads((tmp_path / "manifest_download.json").read_text())
    by_date = {a["trade_date"]: a for a in man["attempts"]}
    assert by_date["2026-01-05"]["sha256"] == hd._sha256(GOOD_PAYLOAD)


def test_downloader_resumable_skips_verified_existing(tmp_path):
    run(tmp_path, make_fetcher())
    res = run(tmp_path, make_fetcher())
    assert res["summary"]["skipped_verified"] == 3
    # immutability: second pass did not rewrite
    assert (tmp_path / "bhavcopy_20260105.json").read_bytes() == GOOD_PAYLOAD


def test_downloader_reports_holiday_without_fabricating(tmp_path):
    res = run(tmp_path, make_fetcher(body=b"{}"))
    assert res["summary"]["holiday_or_unavailable"] == 3
    assert not list(tmp_path.glob("bhavcopy_*.json"))


def test_downloader_blocked_access_reports_manual_required(tmp_path):
    res = run(tmp_path, make_fetcher(code=403))
    assert res["summary"]["manual_required"] == 3
    assert res["manual_required_dates"] == ["2026-01-05", "2026-01-06", "2026-01-07"]
    assert not list(tmp_path.glob("bhavcopy_*.json"))


def test_downloader_html_error_page_is_rejected(tmp_path):
    res = run(tmp_path, make_fetcher(body=b"<!doctype html><html>403 Access Denied</html>"))
    assert res["summary"]["manual_required"] == 3


def test_downloader_retries_bounded(tmp_path):
    def flaky_fetcher(url, timeout=10.0, extra_headers=None):
        if url.endswith("/market-data/bhavcopy"):
            return 200, PAGE, {"content-type": "text/html"}
        raise ConnectionError("reset")

    res = run(tmp_path, flaky_fetcher)
    man = json.loads((tmp_path / "manifest_download.json").read_text())
    failed = [a for a in man["attempts"] if a["status"] == "failed"]
    assert len(failed) == 3
    for a in failed:
        assert a["retries"] == hd.DEFAULT_MAX_RETRIES  # bounded, never infinite
    assert not list(tmp_path.glob("bhavcopy_*.json"))


def test_downloader_payload_change_never_overwrites(tmp_path):
    run(tmp_path, make_fetcher())
    other = GOOD_PAYLOAD.replace(b"100200", b"100250", 1)
    res = run(tmp_path, make_fetcher(body=other))
    assert res["summary"]["checksum_conflict"] == 3
    # original bytes untouched
    assert (tmp_path / "bhavcopy_20260105.json").read_bytes() == GOOD_PAYLOAD
    # new bytes quarantined for human review
    assert list(tmp_path.glob("bhavcopy_20260105.conflict_*.json"))
    assert (list(tmp_path.glob("bhavcopy_20260105.conflict_*.json"))[0].read_bytes()
            == other)


# ---------------------------------------------------------------- validation

def test_mcx_json_maps_to_canonical_schema():
    rows = validation.mcx_json_rows_to_csv_rows(GOOD_PAYLOAD, dt.date(2026, 1, 5))
    assert rows[0]["symbol"] == "GOLD"
    assert rows[0]["close"] == "100200"
    assert rows[0]["previous_close"] == "100000"
    assert rows[0]["volume_lots"] == "1500"


def test_mcx_json_rejects_unfamiliar_payload():
    with pytest.raises(IngestionError):
        validation.mcx_json_rows_to_csv_rows(b'{"Data": [{"foo": 1}]}', dt.date(2026, 1, 5))
    with pytest.raises(IngestionError):
        validation.mcx_json_rows_to_csv_rows(b"not json", dt.date(2026, 1, 5))
    with pytest.raises(IngestionError):
        validation.mcx_json_rows_to_csv_rows(b'{"NoData": []}', dt.date(2026, 1, 5))


def test_mcx_json_empty_payload_allowed():
    assert validation.mcx_json_rows_to_csv_rows(b'{"Data": []}', dt.date(2026, 1, 5)) == []


def test_write_csv_roundtrip_through_loader(tmp_path):
    rows = validation.mcx_json_rows_to_csv_rows(GOOD_PAYLOAD, dt.date(2026, 1, 5))
    p = tmp_path / "BhavCopyDateWise_05012026.csv"
    validation.write_bhavcopy_csv(rows, p, dt.date(2026, 1, 5))
    df = load_bhavcopy([p])
    assert len(df) == 1
    r = df.iloc[0]
    assert r["symbol"] == "GOLD" and r["close"] == 100200.0


def test_dq_checks_and_report(tmp_path):
    frame = pd.DataFrame([
        {"trade_date": pd.Timestamp("2026-01-05"), "symbol": "GOLD",
         "expiry_ts": pd.Timestamp("2026-02-05"), "close": 100200.0,
         "high": 100500.0, "low": 99500.0, "volume_lots": 1500.0,
         "open_interest_lots": 9000.0},
        {"trade_date": pd.Timestamp("2026-01-06"), "symbol": "GOLD",
         "expiry_ts": pd.Timestamp("2026-02-05"), "close": pd.NA,
         "high": 101.0, "low": 102.0, "volume_lots": -1.0,
         "open_interest_lots": pd.NA},
    ])
    rep = validation.build_report(frame, [("a.csv", "AA"), ("b.csv", "AA")])
    c = rep["checks"]
    assert c["duplicate_keys"] == 0
    assert c["blank_close"] == 1
    assert c["price_consistency"] == 1      # low > high
    assert c["nonpositive_volumes"] == 1
    assert c["missing_oi"] >= 1
    assert c["duplicate_sha_files"] == 1    # identical identical-sha
    assert "not" in rep["backtest_eligibility_note"]
    validation.write_report_md(rep, tmp_path / "DATA_QUALITY_REPORT.md")
    assert (tmp_path / "DATA_QUALITY_REPORT.md").exists()


# ---------------------------------------------------------------- dedup

def _csv(rows, tmp_path, name):
    lines = ["Date,Instrument Name,Symbol,Expiry Date,Open,High,Low,Close,Previous Close,"
             "Volume(Lots),Value(Lacs),Open Interest(Lots)"]
    lines += rows
    p = tmp_path / name
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return p


def test_conflict_aware_dedup_prefers_priced_record(tmp_path):
    a = _csv(["2026-01-05,FUTCOM,GOLD,05FEB2026,1,1,1,100000,1,,50,9000"], tmp_path, "a.csv")
    b = _csv(["2026-01-05,FUTCOM,GOLD,05FEB2026,1,1,1,100000,1,1500,50,9000"], tmp_path, "b.csv")
    df = load_bhavcopy([a, b])
    assert len(df) == 1
    assert df.iloc[0]["volume_lots"] == 1500.0


def test_exact_duplicate_keeps_first(tmp_path):
    a = _csv(["2026-01-05,FUTCOM,GOLD,05FEB2026,1,1,1,100000,1,1500,50,9000"], tmp_path, "fa.csv")
    b = _csv(["2026-01-05,FUTCOM,GOLD,05FEB2026,1,1,1,100000,1,1500,50,9000"], tmp_path, "fb.csv")
    df = load_bhavcopy([a, b])
    assert len(df) == 1


# ---------------------------------------------------------------- readiness

def _readiness_frame(n_dates=1):
    rows = []
    d0 = dt.date(2026, 1, 5)
    for i in range(n_dates):
        d = d0 + dt.timedelta(days=i)
        for j, exp in enumerate(["2026-02-05", "2026-04-05"]):
            rows.append({
                "trade_date": pd.Timestamp(d), "symbol": "GOLD",
                "expiry_ts": pd.Timestamp(exp), "close": 100000.0 + i + j,
                "stale": False,
            })
    return pd.DataFrame(rows)


def test_readiness_single_day_is_not_ready_for_backtest(tmp_path):
    audit = readiness.audit(
        _readiness_frame(1),
        verified_cost_fields=["brokerage"],
        unverified_cost_fields=["exchange txn", "stamp", "slippage", "ctt"],
        engine_run_path=tmp_path / "quant_report.json",
    )
    verdicts = {g["gate"]: g["verdict"] for g in audit["gates"]}
    assert verdicts["dataCoverage"] == "OK"
    assert verdicts["minSpreadObservations"] == "NOT OK"
    assert verdicts["walkForwardViability"] == "NOT OK"
    assert verdicts["costInputsVerified"] == "NOT OK"
    assert verdicts["engineRunClean"] == "NOT OK"
    assert audit["verdict"] == "NOT READY"


def test_readiness_full_signals_ready(tmp_path):
    (tmp_path / "quant_report.json").write_text(json.dumps({"results": {"GOLD": {}}, "trading_days_loaded": 120}))
    audit = readiness.audit(
        _readiness_frame(120),
        verified_cost_fields=["brokerage", "exchange txn", "ctt"],
        unverified_cost_fields=[],
        eligibility_counts={"eligible": 118},
        engine_run_path=tmp_path / "quant_report.json",
    )
    assert audit["verdict"] == "READY", audit["gates"]


def test_eligible_estimate_needs_two_priced_expiries():
    df = _readiness_frame(3)
    assert readiness.eligible_estimate(df) == 3
    single_leg = df.drop(df.index[[0]])
    assert readiness.eligible_estimate(single_leg) < 3


# ---------------------------------------------------------------------------
# Pass 11 — Ingestion, Discovery, & Disentangled Readiness Tests
# ---------------------------------------------------------------------------

def test_find_bhavcopy_files_across_both_directories(tmp_path):
    """find_bhavcopy_files discovers files across both root and data/raw/mcx/."""
    from quant.data import find_bhavcopy_files

    root = tmp_path / "repo"
    raw_dir = root / "data" / "raw" / "mcx"
    raw_dir.mkdir(parents=True)

    # File in root
    (root / "BhavCopyDateWise_16102026.csv").write_text("Date\n", encoding="utf-8")
    # File in data/raw/mcx
    (raw_dir / "BhavCopyDateWise_19102026.csv").write_text("Date\n", encoding="utf-8")

    discovered = find_bhavcopy_files(root)
    names = [p.name for p in discovered]
    assert "BhavCopyDateWise_16102026.csv" in names
    assert "BhavCopyDateWise_19102026.csv" in names
    assert len(discovered) == 2


def test_eligible_estimate_does_not_conflate_multi_symbol_candidates():
    """22 symbols on 1 day must count as 1 trading session, NOT 22 spread sessions."""
    # Create 22 symbols on a single date, each with 2 expiries
    rows = []
    d = pd.Timestamp("2026-10-16")
    for i in range(22):
        sym = f"SYM{i:02d}"
        for exp in ("2026-11-01", "2026-12-01"):
            rows.append({
                "trade_date": d, "symbol": sym, "expiry_ts": pd.Timestamp(exp),
                "close": 1000.0, "stale": False,
            })
    multi_sym_frame = pd.DataFrame(rows)

    # Old bug counted this as 22; corrected implementation must count at most 1
    estimate = readiness.eligible_estimate(multi_sym_frame)
    assert estimate == 1, f"expected 1 time-series session, got {estimate}"


def test_readiness_audit_disentangles_all_7_metrics(tmp_path):
    """Readiness audit returns distinct, un-conflated metrics."""
    (tmp_path / "quant_report.json").write_text(json.dumps({
        "results": {
            "GOLDM": {
                "near_expiry": "2026-12-04",
                "far_expiry": "2027-01-05",
                "spread_observations": 2,
                "full_summary": {"trades": 0, "sessions": 2},
                "walk_forward": {"folds": []},
            }
        },
        "trading_days_loaded": 2,
    }))

    audit_res = readiness.audit(
        _readiness_frame(2),
        verified_cost_fields=["brokerage", "exchange txn", "ctt"],
        unverified_cost_fields=[],
        engine_run_path=tmp_path / "quant_report.json",
    )
    m = audit_res["metrics"]
    assert m["distinct_trading_sessions"] == 2
    assert "GOLDM_near20261204_far20270105" in m["valid_dated_spread_observations_by_pair"]
    assert m["valid_dated_spread_observations_by_pair"]["GOLDM_near20261204_far20270105"] == 2
    assert m["unique_eligible_contract_pairs_count"] == 1
    assert m["observations_available_for_rolling_z"] == 2
    assert m["observations_available_before_decision_max"] == 2
    assert m["actual_walk_forward_evaluation_dates"] == 0
    assert m["trades_generated_by_engine"] == 0
    # Gate verdicts
    verdicts = {g["gate"]: g["verdict"] for g in audit_res["gates"]}
    assert verdicts["minSpreadObservations"] == "NOT OK"  # 2 < 30
    assert verdicts["walkForwardViability"] == "NOT OK"   # 2 < 100
