"""QA invariants for the GoldLens quant module — final-check sweeps.

SYNTHETIC series only inside this file (clearly labeled, not market data);
real repo data is exercised separately in test_api_integration.py.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from quant.config import CostInput, StrategyConfig
from quant.contracts import get_spec
from quant.engine import run_backtest
from quant.selection import eligible_contracts
from quant.spreads import pair_spreads
from quant.zscore import rolling_zscore
from tests.test_backtest import trending_then_reverting
from tests.test_quant import synthetic_spread_frame


def test_invariant_daily_mtm_equals_realized_trade_sum():
    cfg = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=0.2, z_exit=0.05, max_holding_days=500)
    sf = trending_then_reverting(150)
    res = run_backtest(sf, "GOLD", cfg)
    assert res.trades
    realized = sum(tr.gross_pnl_rupees for tr in res.trades if tr.gross_pnl_rupees is not None)
    np.testing.assert_allclose(res.daily_pnl_gross.sum(), realized, rtol=1e-9)


def test_invariant_cost_accounting_exact_formula():
    cost = CostInput(
        brokerage_rupees_per_lot=50.0,
        exchange_transaction_rupees_per_lot=118.0,
        stamp_duty_bps_on_turnover=3.0,
        slippage_ticks=3.0,
    )
    cfg = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=0.2, z_exit=0.05, max_holding_days=500,
                         lots_per_leg=2, costs=cost)
    sf = trending_then_reverting(150)
    res = run_backtest(sf, "GOLD", cfg, segment_name="qa")
    assert res.trades
    rv = get_spec("GOLD").rvalue_per_lot_per_quote_unit
    lots = cfg.lots_per_leg
    dates = pd.DatetimeIndex(sf["trade_date"])
    price_by_date = {str(d.date()): float(nq + fq)
                     for d, nq, fq in zip(dates, sf["near_close"], sf["far_close"])}
    charged = []
    for tr in res.trades:
        charged.append(price_by_date[str(tr.entry_exec_date.date())])
        if tr.exit_reason != "end_of_data":
            charged.append(price_by_date[str(tr.exit_exec_date.date())])
    turn_total = sum(q * rv * lots for q in charged)
    per_event_fixed = 2 * lots * (
        cost.brokerage_rupees_per_lot + cost.exchange_transaction_rupees_per_lot
        + cost.exchange_transaction_rupees_per_lot * cost.gst_rate_on_transaction_charges
        + cost.slippage_ticks * cost.tick_size_rupees_per_quote_unit * rv
    )
    expected = per_event_fixed * len(charged) \
        + cost.stamp_duty_bps_on_turnover / 10_000.0 * turn_total
    np.testing.assert_allclose(res.metrics.total_cost_rupees, expected, rtol=1e-9)


def test_invariant_zscore_matches_manual_rolling():
    cfg = StrategyConfig(lookback_days=20, min_hist_days=15)
    sf = synthetic_spread_frame(60, seed=9)
    z = rolling_zscore(sf["spread"], cfg)
    manual_mean = sf["spread"].rolling(20, min_periods=15).mean()
    manual_std = sf["spread"].rolling(20, min_periods=15).std(ddof=1)
    np.testing.assert_allclose(z["mean"], manual_mean, rtol=1e-9)
    np.testing.assert_allclose(z["std"], manual_std, rtol=1e-9)
    manual_z = (sf["spread"] - manual_mean) / manual_std
    np.testing.assert_allclose(z["z"], manual_z, rtol=1e-9, equal_nan=True)


def test_invariant_expiry_and_liquidity_filters_matrix():
    base = dict(
        trade_date=pd.Timestamp("2026-01-01"), symbol="GOLD", instrument="FUTCOM",
        expiry_ts=pd.Timestamp("2026-11-01"), close=150_000.0, open=150_000.0,
        high=150_100.0, low=149_900.0, volume_lots=2000.0,
        open_interest_lots=9000.0, value_lakhs=5000.0, stale=False,
    )
    filt = StrategyConfig().liquidity
    cases = [
        ({}, "eligible"),
        ({**base, "volume_lots": 499.0}, "vol<500"),
        ({**base, "open_interest_lots": 999.0}, "oi<1000"),
        ({**base, "value_lakhs": 99.0}, "value<100"),
        ({**base, "expiry_ts": pd.Timestamp("2026-01-11")}, "dte<21"),
        ({**base, "expiry_ts": pd.Timestamp("2028-01-05")}, "dte>365"),
        ({**base, "close": 0.0, "open": 0.0, "high": 0.0, "low": 0.0}, "invalid_price"),
        ({**base, "symbol": "SILVER", "instrument": "FUTCOM"}, "symbol_not_verified"),
        ({**base, "close": float("nan")}, "no_valid_price_or_expiry"),
    ]
    for overrides, expected in cases:
        payload = {**base, **overrides}
        frame = pd.DataFrame([payload])
        elig = eligible_contracts(frame, payload["trade_date"], filt)
        r = elig.iloc[0]
        expected_eligible = expected == "eligible"
        assert (bool(r["eligible"]) == expected_eligible), (expected, r["reason"])
        if not expected_eligible:
            for part in expected.split("|"):
                assert part in str(r["reason"]), (expected, part, r["reason"])
