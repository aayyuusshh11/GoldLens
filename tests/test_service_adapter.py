"""Tests for quant/service_adapter.py — the FastAPI GOLDLENS_QUANT_PACKAGE
integration contract (backend/app/services/quant_interface.py).

SYNTHETIC frames are generated here and clearly labeled; the real repo
bhavcopy (1 trading day) is used only to verify honest refusals.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from quant.config import StrategyConfig
from quant.engine import run_backtest
from quant.run_quant import compute_daily_filters
from quant.service_adapter import (
    GoldlensQuantService,
    get_quant_service,
    load_frame,
)
from quant.spreads import pair_spreads
from quant.zscore import rolling_zscore

PAIR_GOLDM_REAL = "GOLDM_near20261204_far20270105"


def goldm_pair_id(frame: pd.DataFrame, symbol: str = "GOLDM") -> str:
    exps = sorted(frame.loc[frame.symbol == symbol, "expiry_ts"].unique())
    near, far = pd.Timestamp(exps[0]), pd.Timestamp(exps[1])
    return f"{symbol}_near{near:%Y%m%d}_far{far:%Y%m%d}"


def build_goldm_frame(n_days: int = 40, entry_wide: float | None = 2200.0):
    """SYNTHETIC GOLDM-family normalized frame (not market data).

    Spread ~1200 with small wobble for days 0..n-3, then optionally widened
    to 2200 on the last two sessions so z >= z_entry on the final day.
    """
    dates = pd.bdate_range("2026-01-01", periods=n_days)
    near_exp = dates[0] + pd.Timedelta(days=90)   # dte >= 21 for all sessions
    far_exp = dates[0] + pd.Timedelta(days=200)   # dte <= 365 for all sessions
    spread = np.full(n_days, 1200.0)
    rng = np.random.default_rng(5)
    spread = spread + rng.uniform(-1.0, 1.0, size=n_days)
    if entry_wide is not None:
        spread[-2] = entry_wide
        spread[-1] = entry_wide
    rows = []
    for i, d in enumerate(dates):
        near_c = 150_000.0
        far_c = near_c + float(spread[i])
        for exp, c in ((near_exp, near_c), (far_exp, far_c)):
            rows.append(
                dict(
                    trade_date=d, instrument="FUTCOM", symbol="GOLDM",
                    expiry_ts=exp, open=c, high=c + 50.0, low=c - 50.0, close=c,
                    volume_lots=5000.0, open_interest_lots=20000.0,
                    value_lakhs=c * 10.0 * 5000.0 / 1e5, stale=False,
                )
            )
    return StrategyConfig(lookback_days=30, min_hist_days=15), pd.DataFrame(rows), dates, (near_exp, far_exp)


def test_service_contract_shape():
    svc = get_quant_service()
    assert isinstance(svc, GoldlensQuantService)
    assert callable(getattr(svc, "analyze_signal"))
    assert callable(getattr(svc, "run_backtest"))


def test_invalid_pair_id_format():
    svc = get_quant_service()
    r = svc.analyze_signal("not-a-pair", "2026-01-01")
    assert r["decision"] == "NO_TRADE"
    assert "PAIR_UNKNOWN_FORMAT" in r["reason_codes"]
    assert r["z_score"] is None and r["spread"] is None
    b = svc.run_backtest("bad", "", "", "default")  # type: ignore[arg-type]
    assert b["runnable"] is False and b["gross_pnl"] is None


def test_unknown_strategy_version_returns_runnable_false():
    svc = get_quant_service()
    cfg, frame, dates, _ = build_goldm_frame()
    b = svc.run_backtest("GOLDM_near20260315_far20260717", "2026-01-01",
                         "2026-02-01", "v9-unknown", frame=frame)
    assert b["runnable"] is False and b["gross_pnl"] is None
    assert any("v9-unknown" in a for a in b["assumptions"])


def test_unsupported_symbol_requires_verified_spec():
    svc = get_quant_service()
    r = svc.analyze_signal("SILVER_near20261204_far20270305", "2026-01-01")
    assert r["decision"] == "NO_TRADE"
    assert "UNSUPPORTED_SYMBOL" in r["reason_codes"]
    assert r["spread"] is None and r["gross_edge"] is None


def test_date_not_in_data_is_reported_not_fabricated():
    svc = get_quant_service()
    frame = load_frame()  # single repo trading day 2026-10-16
    r = svc.analyze_signal(PAIR_GOLDM_REAL, "2026-10-15", frame=frame)
    assert r["decision"] == "NO_TRADE"
    assert "DATE_NOT_IN_DATA" in r["reason_codes"]
    assert r["spread"] is None and r["z_score"] is None


def test_real_single_day_insufficient_history_with_reference_spread():
    svc = get_quant_service()
    frame = load_frame()
    r = svc.analyze_signal(PAIR_GOLDM_REAL, "2026-10-16", frame=frame)
    assert r["decision"] == "NO_TRADE"
    assert "INSUFFICIENT_HISTORY" in r["reason_codes"]
    assert r["z_score"] is None
    # engine convention: far_close - near_close = 149227 - 147866
    assert r["spread"] == 1361.0
    assert r["gross_edge"] is None
    assert r["notes"]  # explanation present, nothing invented


def test_costs_missing_never_yields_estimated_or_net_values():
    svc = get_quant_service()
    cfg, frame, dates, _ = build_goldm_frame()
    pair = goldm_pair_id(frame)
    r = svc.analyze_signal(pair, dates[-1].date().isoformat(), frame=frame)
    assert r["estimated_cost"] is None and r["net_edge"] is None
    b = svc.run_backtest(pair, dates[0].date().isoformat(), dates[-1].date().isoformat(),
                         "default", frame=frame)
    assert b["net_pnl"] is None and b["estimated_costs"] is None
    assert any("verified CostInput not supplied" in a for a in b["assumptions"])


def test_valid_z_signal_path_matches_engine_semantics():
    svc = get_quant_service()
    cfg, frame, dates, (near_exp, far_exp) = build_goldm_frame()
    pair = goldm_pair_id(frame)
    as_of = dates[-1].date().isoformat()
    r = svc.analyze_signal(pair, as_of, frame=frame)
    sf = pair_spreads(frame, "GOLDM", near_exp, far_exp)
    z_tbl = rolling_zscore(sf.set_index("trade_date")["spread"], cfg)
    as_ts = pd.Timestamp(as_of)
    assert np.isclose(r["z_score"], float(z_tbl.loc[as_ts, "z"]))
    assert r["z_score"] >= cfg.z_entry
    assert r["decision"] == "BUY_NEAR_SELL_FAR"  # engine SHORT SPREAD
    assert r["spread"] == float(sf.loc[sf.trade_date == as_ts, "spread"].iloc[0])
    expected_edge = (r["spread"] - float(z_tbl.loc[as_ts, "mean"])) * 10.0 * cfg.lots_per_leg
    assert np.isclose(r["gross_edge"], expected_edge)
    assert "MODEL" in (r["notes"] or "")  # model figure is labeled


def test_backtest_insufficient_history_refuses():
    svc = get_quant_service()
    frame = load_frame()
    b = svc.run_backtest(PAIR_GOLDM_REAL, "2026-10-16", "2026-10-16", "default", frame=frame)
    assert b["runnable"] is False
    assert b["completed_trades"] == 0
    assert b["gross_pnl"] is None and b["net_pnl"] is None
    assert b["estimated_costs"] is None and b["max_drawdown"] is None


def test_runnable_backtest_matches_engine_metrics_and_withholds_net():
    svc = get_quant_service()
    cfg, frame, dates, (near_exp, far_exp) = build_goldm_frame(n_days=40)
    pair = goldm_pair_id(frame)
    b = svc.run_backtest(pair, dates[0].date().isoformat(), dates[-1].date().isoformat(),
                         "default", frame=frame)
    assert b["runnable"] is True
    sf = pair_spreads(frame, "GOLDM", near_exp, far_exp)
    ok, reasons = compute_daily_filters(frame, sf, near_exp, far_exp, "GOLDM", cfg)
    ref = run_backtest(sf, "GOLDM", cfg, segment_name="default", filters_ok=ok,
                       filter_reasons=reasons)
    assert b["completed_trades"] == len(ref.trades)
    assert np.isclose(b["gross_pnl"], ref.metrics.gross_pnl_rupees)
    assert b["max_drawdown"] == ref.metrics.max_drawdown_rupees
    assert b["net_pnl"] is None and b["estimated_costs"] is None


# ---------------------------------------------------------------------------
# Pass 11 — Real multi-session & inverted expiry adapter tests
# ---------------------------------------------------------------------------

def test_load_frame_finds_all_historical_sessions():
    """load_frame discovers both 16 Oct and 19 Oct genuine MCX sessions."""
    frame = load_frame()
    dates = sorted(frame["trade_date"].dt.strftime("%Y-%m-%d").unique())
    assert "2026-10-16" in dates
    assert "2026-10-19" in dates
    assert len(dates) >= 2


def test_analyze_signal_on_new_date_2026_10_19():
    """analyze_signal on 2026-10-19 produces genuine spread (1359.0) and honest refusal."""
    svc = get_quant_service()
    frame = load_frame()
    r = svc.analyze_signal(PAIR_GOLDM_REAL, "2026-10-19", frame=frame)
    assert r["decision"] == "NO_TRADE"
    assert "INSUFFICIENT_HISTORY" in r["reason_codes"]
    assert r["z_score"] is None
    # 148588 - 147229 = 1359.0
    assert r["spread"] == 1359.0
    assert r["gross_edge"] is None
    assert "2 distinct session(s)" in r["notes"]


def test_backtest_across_both_real_dates_refuses_honestly():
    """run_backtest across 2026-10-16..2026-10-19 withholds metrics honestly."""
    svc = get_quant_service()
    frame = load_frame()
    b = svc.run_backtest(PAIR_GOLDM_REAL, "2026-10-16", "2026-10-19", "default", frame=frame)
    assert b["runnable"] is False
    assert b["completed_trades"] == 0
    assert b["gross_pnl"] is None
    assert any("2 spread observation(s)" in a for a in b["assumptions"])


def test_pair_id_inverted_expiries_refused():
    """An inverted pair (near > far) is safely refused by the adapter."""
    svc = get_quant_service()
    frame = load_frame()
    inverted_pair = "GOLDM_near20270105_far20261204"
    r = svc.analyze_signal(inverted_pair, "2026-10-19", frame=frame)
    assert r["decision"] == "NO_TRADE"
    assert "NO_PAIR_OBSERVATIONS" in r["reason_codes"]
    b = svc.run_backtest(inverted_pair, "2026-10-16", "2026-10-19", "default", frame=frame)
    assert b["runnable"] is False
