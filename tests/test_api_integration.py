"""INTEGRATION tests for quant.api.

- Tests touching ``BhavCopyDateWise_16102026.csv`` use the REAL repo bhavcopy
  (single trading day, 16 Oct 2026) — used to verify the boundary against real
  data, NOT presented as a backtest.
- Tests using ``make_synthetic_...`` fixtures are clearly labeled SYNTHETIC
  and exist only for engine/DTO behavior verification. They are never
  historical market data and never shipped in reports.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from quant.api import (
    CAMPAIGN_MIN_DAYS,
    DataQualityError,
    SchemaError,
    SignalDTO,
    ValidatedDataset,
    compute_eligible_contracts,
    load_dataset,
    run_strategy_backtest,
    validate_bhavcopy_frame,
)
from quant.config import StrategyConfig

REAL_CSV = REPO / "BhavCopyDateWise_16102026.csv"


def make_synthetic_frame(n_days: int = 60, seed: int = 0) -> pd.DataFrame:
    """SYNTHETIC bhavcopy-style fixture for API tests only. NOT market data."""
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range("2026-01-01", periods=n_days)
    near_level = 150_000.0
    near_expiry = dates[-1] + pd.Timedelta(days=45)
    far_expiry = dates[-1] + pd.Timedelta(days=90)
    rows = []
    for d in dates:
        level = near_level + rng.normal(0, 60) + np.finfo(float).eps
        spread = 1400.0 + rng.normal(0, 250)
        for sym, exp, close, vol in (
            ("GOLD", near_expiry, level, 3000.0),
            ("GOLD", far_expiry, level + spread, 2000.0),
        ):
            rows.append(
                dict(
                    trade_date=d, symbol=sym, instrument="FUTCOM",
                    expiry_ts=exp, close=close, open=close, high=close + 50, low=close - 50,
                    volume_lots=vol, open_interest_lots=vol * 3, value_lakhs=vol * close / 1e5,
                    stale=False, source_file="SYNTHETIC_fixture_not_market_data",
                )
            )
    return pd.DataFrame(rows)


def test_real_single_day_dataset_loads_and_is_flagged():
    ds = load_dataset([REAL_CSV])
    assert isinstance(ds, ValidatedDataset)
    assert ds.n_trading_days == 1
    assert ds.date_range == ("2026-10-16", "2026-10-16")
    assert any("PASS" in c for c in ds.spec_checks)


def test_schema_and_quality_errors_are_typed():
    with pytest.raises(SchemaError):
        validate_bhavcopy_frame(pd.DataFrame({"a": [1]}))
    with pytest.raises(DataQualityError):
        validate_bhavcopy_frame(pd.DataFrame({c: [] for c in
            ["trade_date", "symbol", "instrument", "expiry_ts", "close",
             "volume_lots", "open_interest_lots", "value_lakhs"]}))
    with pytest.raises(DataQualityError):
        load_dataset([REPO / "definitely_missing.csv"])


def test_missing_pair_error_message_specific():
    with pytest.raises(DataQualityError) as err:
        run_strategy_backtest(make_synthetic_frame(seed=1).assign(symbol="GOLDPETAL"), StrategyConfig(), "GOLDPETAL")
    assert "no tradable calendar pair" in str(err.value)


def test_real_single_day_report_is_diagnostics_not_backtest():
    ds = load_dataset([REAL_CSV])
    report = run_strategy_backtest(ds.frame, StrategyConfig(), "GOLDM")
    payload = report.to_json_dict()
    json.dumps(payload)  # must be JSON-serializable
    assert report.is_valid_backtest is False
    assert "NOT A VALID BACKTEST" in report.verdict
    assert report.metrics is not None and report.metrics.status == "diagnostics_only"
    assert all(s.no_trade_reason for s in report.signals if s.signal == "NO TRADE")


def test_synthetic_multimonth_report_is_valid_backtest():
    frame = make_synthetic_frame(n_days=90, seed=3)
    report = run_strategy_backtest(frame, StrategyConfig(lookback_days=20, min_hist_days=15), "GOLD")
    assert report.is_valid_backtest is True
    assert report.verdict.startswith("VALID BACKTEST")
    assert len(report.spread_observations) == 90
    assert len(report.signals) == len(report.z_score) == 90
    assert len(report.trades) >= 0
    assert report.metrics.n_days >= CAMPAIGN_MIN_DAYS


def test_signal_explanations_consumable_with_no_trade_reason():
    frame = make_synthetic_frame(n_days=40, seed=1)
    report = run_strategy_backtest(frame, StrategyConfig(lookback_days=20, min_hist_days=10), "GOLD")
    for sig in report.signals[:10]:
        assert isinstance(sig, SignalDTO)
        assert sig.rationale, "every signal (incl rejections) must carry a reason"
        if sig.signal == "NO TRADE":
            assert sig.no_trade_reason
    assert report.signals
    assert {s.signal for s in report.signals} <= {"NO TRADE", "HOLD", "LONG SPREAD", "SHORT SPREAD", "EXIT"}


def test_eligible_contracts_snapshot():
    ds = load_dataset([REAL_CSV])
    rows = compute_eligible_contracts(ds.frame, StrategyConfig())
    goldm = [r for r in rows if r.symbol == "GOLDM"]
    assert any(r.eligible for r in goldm)
    for r in goldm:
        assert r.lot_size_g == 100.0 and r.quote_basis_g == 10.0
    assert all(hasattr(r, "reason") for r in rows)


def test_signal_dtos_carry_aligned_trade_dates():
    frame = make_synthetic_frame(n_days=40, seed=8)
    report = run_strategy_backtest(frame, StrategyConfig(lookback_days=20, min_hist_days=10), "GOLD")
    assert len(report.signals) == len(report.spread_observations)
    assert all(s.trade_date for s in report.signals), "app needs dates on every signal"
    obs_dates = [o.trade_date for o in report.spread_observations]
    assert [s.trade_date for s in report.signals] == obs_dates
