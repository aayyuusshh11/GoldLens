"""Backtesting-engine checkups (deterministic, synthetic data only)."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from quant.config import CostInput, StrategyConfig
from quant.engine import compare_walk_forward, run_backtest, split_train_test, walk_forward
from tests.test_quant import synthetic_spread_frame


def trending_then_reverting(n: int = 120) -> pd.DataFrame:
    """Synthetic spreads: wide first half, tight second half => short spread wins."""
    sf = synthetic_spread_frame(n, seed=11)
    sf.loc[sf.index[: n // 2], "spread"] += 2500
    sf["far_close"] = sf["near_close"] + sf["spread"]
    return sf


def test_overlap_prevention_deterministic():
    cfg2 = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=0.3, z_exit=0.1, max_holding_days=500, allow_overlap=False)
    cfg2.validate()
    sf = trending_then_reverting()
    res = run_backtest(sf, "GOLD", cfg2)
    for pos in res.positions:
        assert pos in ("flat", "long", "short")
    opened_positions = (res.positions != "flat").sum()
    assert opened_positions > 0
    seq = res.positions.to_list()
    for i in range(1, len(seq)):
        if seq[i] != "flat" and seq[i - 1] != "flat":
            assert seq[i] == seq[i - 1], "position cannot flip sign while still open"


def test_no_trade_period_clean_metrics():
    cfg = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=3.9, stop_z=4.0)
    sf = synthetic_spread_frame(80, seed=5)
    res = run_backtest(sf, "GOLD", cfg)
    assert len(res.trades) == 0
    assert res.metrics.gross_pnl_rupees == 0.0
    assert res.metrics.win_rate is None
    assert res.metrics.sharpe_ratio is None
    assert res.metrics.total_cost_rupees is None


def test_exec_mode_and_overlap_validation_rejects():
    with pytest.raises(ValueError):
        StrategyConfig(exec_mode="same_close").validate()
    with pytest.raises(ValueError):
        StrategyConfig(allow_overlap=True).validate()
    with pytest.raises(ValueError):
        StrategyConfig(walk_forward_folds=1).validate()
    assert StrategyConfig(exec_mode="next_close").exec_mode == "next_close"


def test_missing_dates_create_no_fabricated_rows():
    sf = synthetic_spread_frame(60, seed=2)
    cfg = StrategyConfig(lookback_days=20, min_hist_days=15, z_entry=0.2, z_exit=0.05, max_holding_days=200)
    gap_dates = set(sf["trade_date"].iloc[20:33])
    sf_gap = sf[~sf["trade_date"].isin(gap_dates)].reset_index(drop=True)
    res_a = run_backtest(sf, "GOLD", cfg)
    res_b = run_backtest(sf_gap, "GOLD", cfg)
    assert res_a.n_sessions - res_b.n_sessions == len(gap_dates)
    assert all(pd.Timestamp(d) not in gap_dates for d in res_b.daily_pnl_gross.index), (
        "no dates outside supplied history may be fabricated"
    )
    # per-trade P&L identity still holds inside the gapped run
    for tr in res_b.trades:
        if tr.gross_pnl_rupees is not None:
            sign = 1.0 if tr.direction == "long" else -1.0
            np.testing.assert_allclose(
                tr.gross_pnl_rupees, sign * (tr.exit_spread - tr.entry_spread) * 100.0, rtol=1e-9
            )


def test_gross_vs_net_metric_bases_and_cost_record():
    cfg = StrategyConfig(
        lookback_days=30,
        min_hist_days=15,
        z_entry=0.2,
        z_exit=0.05,
        max_holding_days=500,
        costs=CostInput(brokerage_rupees_per_lot=40.0, exchange_transaction_rupees_per_lot=100.0),
    )
    sf = trending_then_reverting()
    res = run_backtest(sf, "GOLD", cfg)
    assert res.diagnostics["costs_configured"] is True
    assert res.diagnostics["metrics_basis"] == "net"
    np.testing.assert_allclose(
        res.metrics.gross_pnl_rupees, res.diagnostics["gross_daily_pnl_sum"], atol=1e-6
    )
    if res.metrics.total_cost_rupees:
        net_sum = res.diagnostics["net_daily_pnl"]
        assert abs((res.metrics.gross_pnl_rupees - res.metrics.total_cost_rupees) - net_sum) < 1e-6


def test_max_drawdown_and_sharpe_when_meaningful():
    cfg = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=0.2, z_exit=0.05, max_holding_days=500)
    sf = trending_then_reverting(150)
    res = run_backtest(sf, "GOLD", cfg)
    pnl = res.daily_pnl_gross
    equity = pnl.cumsum()
    dd = equity - equity.cummax()
    np.testing.assert_allclose(res.metrics.max_drawdown_rupees, dd.min(), rtol=1e-9)
    n = len(pnl)
    if n >= 20 and pnl.std(ddof=1) > 0:
        expected = pnl.mean() / pnl.std(ddof=1) * 252 ** 0.5
        np.testing.assert_allclose(res.metrics.sharpe_ratio, expected, rtol=1e-9)


def test_costs_are_deterministic_across_reruns():
    cfg = StrategyConfig(
        lookback_days=30,
        min_hist_days=15,
        z_entry=0.2,
        z_exit=0.05,
        max_holding_days=500,
        costs=CostInput(brokerage_rupees_per_lot=25.0, exchange_transaction_rupees_per_lot=118.0, slippage_ticks=2.0),
    )
    sf = trending_then_reverting(90)
    a = run_backtest(sf, "GOLD", cfg)
    b = run_backtest(sf, "GOLD", cfg)
    assert a.metrics.total_cost_rupees == b.metrics.total_cost_rupees
    assert a.metrics.gross_pnl_rupees == b.metrics.gross_pnl_rupees
    assert [t.entry_exec_date for t in a.trades] == [t.entry_exec_date for t in b.trades]


def test_walk_forward_windows_chronological_and_compared():
    cfg = StrategyConfig(lookback_days=20, min_hist_days=15, walk_forward_folds=3, train_fraction=0.5, min_test_days=10)
    sf = trending_then_reverting(200)
    folds = walk_forward(sf, "GOLD", cfg, n_folds=3)
    assert len(folds) >= 2
    for a, b in zip(folds, folds[1:]):
        assert a.n_sessions < b.n_sessions, "expanding windows must grow chronologically"
    comp = compare_walk_forward(folds)
    assert [r["fold"] for r in comp] == [r.segment_name for r in folds]
    assert all("gross_pnl" in r and "max_drawdown" in r and "sharpe" in r for r in comp)
    # expanding-window results accumulate trades monotonically when the
    # strategy is active
    assert comp[0]["sessions"] < comp[-1]["sessions"]


def test_train_test_split_rejects_on_insufficient_history():
    cfg = StrategyConfig(train_fraction=0.5, min_test_days=10, lookback_days=20, min_hist_days=15)
    sf = synthetic_spread_frame(6)
    train, test, note = split_train_test(sf, cfg)
    assert note is not None, "short history must produce an explanatory note, not silent success"
    assert len(test) < cfg.min_test_days


def test_report_records_config_and_exec_mode():
    cfg = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=0.2, z_exit=0.05, max_holding_days=500)
    sf = trending_then_reverting(90)
    res = run_backtest(sf, "GOLD", cfg)
    summary = res.summary()
    assert summary["exec_mode"] == "next_close"
    assert summary["lots_per_leg"] == 1
    assert summary["z_entry"] == 0.2
    assert res.explanations, "explanations are always produced for reproducibility"


def test_position_sizing_scales_pnl_linearly():
    sf = trending_then_reverting(120)
    cfg1 = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=0.2, z_exit=0.05, max_holding_days=500, lots_per_leg=1)
    cfg4 = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=0.2, z_exit=0.05, max_holding_days=500, lots_per_leg=4)
    r1 = run_backtest(sf, "GOLD", cfg1)
    r4 = run_backtest(sf, "GOLD", cfg4)
    if r1.trades:
        np.testing.assert_allclose(
            r4.metrics.gross_pnl_rupees, r1.metrics.gross_pnl_rupees * 4.0, rtol=1e-9
        )
        for t1, t4 in zip(r1.trades, r4.trades):
            np.testing.assert_allclose(t4.gross_pnl_rupees, t1.gross_pnl_rupees * 4.0, rtol=1e-9)
