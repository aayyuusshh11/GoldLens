"""Tests for the Pass-15 acquisition manifest (quant/ingestion/coverage.py)."""
from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from quant.ingestion.coverage import (
    MCX_HOLIDAYS_2026,
    candidate_trading_dates,
    missing_dates_manifest,
)


def test_full_holidays_are_not_candidates():
    candidates = candidate_trading_dates(date(2026, 9, 29), date(2026, 10, 6))
    got = {c["date"] for c in candidates}
    assert "2026-10-02" not in got          # Mahatma Gandhi Jayanti (both sessions closed)
    assert "2026-09-29" in got and "2026-10-05" in got


def test_partial_holiday_stays_candidate_and_is_flagged():
    candidates = candidate_trading_dates(date(2026, 10, 20), date(2026, 10, 20))
    assert len(candidates) == 1
    assert candidates[0]["partial_holiday"] is True
    assert candidates[0]["holiday_name"] == "Dassera"
    assert "evening session" in candidates[0]["session_note"]


def test_weekends_excluded():
    candidates = candidate_trading_dates(date(2026, 10, 17), date(2026, 10, 19))
    assert [c["date"] for c in candidates] == ["2026-10-19"]


def test_missing_manifest_matches_disk_state():
    m = missing_dates_manifest(["2026-10-16", "2026-10-19"], date(2026, 10, 20))
    assert m["observed_count"] == 2
    assert m["missing_count"] == 1
    assert m["missing_dates"][0]["date"] == "2026-10-20"
    assert m["exhaustive_claim"] is False
    assert "NOT exhaustive" in m["note"]
    assert m["calendar_limit"].startswith("Covers calendar year 2026 only")


def test_manifest_is_deterministic():
    a = missing_dates_manifest(["2026-10-16", "2026-10-19"], date(2026, 10, 20))
    b = missing_dates_manifest(["2026-10-16", "2026-10-19"], date(2026, 10, 20))
    assert a == b


def test_calendar_is_official_2026_only():
    assert all(k.startswith("2026-") for k in MCX_HOLIDAYS_2026)
    assert MCX_HOLIDAYS_2026["2026-12-25"]["session_closed"] == "both"


@pytest.mark.parametrize("observed,end,expected_missing", [
    ([], date(2026, 10, 20), 0),  # nothing observed -> manifest does not guess a start
])
def test_no_observed_dates_yields_no_missing_claims(observed, end, expected_missing):
    m = missing_dates_manifest(observed, end)
    assert m["missing_count"] == expected_missing


def test_pair_requirements_report_uses_canonical_pair(frame_small):
    from quant.ingestion.coverage import pair_requirements_report
    rows = pair_requirements_report(frame_small)
    goldm = [r for r in rows if r["pair_id"].startswith("GOLDM")]
    assert goldm, "canonical GOLDM pair must be listed"
    assert goldm[0]["shared_valid_observations"] == 2
    assert set(goldm[0]["unmet"]) == {"floor", "z_warmup", "walkforward"}


@pytest.fixture
def frame_small():
    """Two-session GOLDM frame matching the real loader schema."""
    rows = []
    for d, px in (("2026-10-16", 63000.0), ("2026-10-19", 62999.0)):
        for sym, exp, price in (
            ("GOLDM", "2026-12-04", px), ("GOLDM", "2027-01-05", px + 10),
        ):
            rows.append({
                "date": d, "instrument": "FUTCOM", "symbol": sym, "expiry_date": exp,
                "expiry_ts": pd.Timestamp(exp), "trade_date": pd.Timestamp(d),
                "open": price, "high": price, "low": price, "close": price,
                "previous_close": price, "volume_lots": 2000,
                "value_lakhs": 300.0, "open_interest_lots": 5000, "stale": False,
            })
    return pd.DataFrame(rows)
