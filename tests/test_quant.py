"""Unit tests for the quant module.

ALL data here is SYNTHETIC, generated inside this test file for deterministic
engine verification. It is never shipped as a "result" — real repo data is
only used by run_quant.py.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from quant.config import StrategyConfig
from quant.contracts import cross_check_spec, get_spec
from quant.data import load_bhavcopy
from quant.engine import run_backtest, split_train_test
from quant.selection import eligible_contracts
from quant.signals import explain_signal, signal_from_z
from quant.spreads import pair_spreads
from quant.zscore import rolling_zscore


def make_bdates(n: int, start: str = "2026-01-01") -> pd.DatetimeIndex:
    return pd.bdate_range(start=start, periods=n)


def synthetic_spread_frame(n: int, seed: int = 0, base_diff: float = 2000.0) -> pd.DataFrame:
    """Synthetic two-leg GOLD spreads: far = near + base + mean-reverting noise."""
    rng = np.random.default_rng(seed)
    dates = make_bdates(n)
    near = 150_000.0 + rng.normal(0, 50, n).cumsum() * 0.01
    noise = rng.normal(0, 400, n)
    spread = base_diff + noise
    far = near + spread
    return pd.DataFrame(
        {
            "trade_date": dates,
            "near_close": near,
            "far_close": far,
            "spread": spread,
        }
    )


def test_contract_specs_cross_check():
    ok_gold, msg = cross_check_spec("GOLD", close=147_918.0, value_lakh_per_lot=153.07)
    ok_goldm, msg2 = cross_check_spec("GOLDM", close=146_425.0, value_lakh_per_lot=15.27)
    assert ok_gold and ok_goldm, (msg, msg2)
    with pytest.raises(KeyError):
        get_spec("GOLDPETAL_NOT_VERIFIED")


def test_pair_spread_computation():
    sf = synthetic_spread_frame(60)
    np.testing.assert_allclose(sf["spread"], sf["far_close"] - sf["near_close"], atol=1e-9)


def test_zscore_causality_no_lookahead():
    cfg = StrategyConfig(lookback_days=30, min_hist_days=15)
    sf = synthetic_spread_frame(120)
    zs_full = rolling_zscore(sf["spread"], cfg)["z"]

    for t in (40, 80, 110):
        zs_trunc = rolling_zscore(sf["spread"].iloc[: t + 1], cfg)["z"]
        assert np.isclose(zs_trunc.iloc[-1], zs_full.iloc[t], atol=1e-9), (
            "z(t) must not depend on future rows"
        )


def test_signal_labels():
    cfg = StrategyConfig(z_entry=1.5, z_exit=0.5, stop_z=3.5)
    assert signal_from_z(-2.0, "flat", cfg) == "LONG SPREAD"
    assert signal_from_z(2.0, "flat", cfg) == "SHORT SPREAD"
    assert signal_from_z(0.0, "flat", cfg) == "NO TRADE"
    assert signal_from_z(-0.2, "long", cfg) == "EXIT"
    assert signal_from_z(-1.0, "long", cfg) == "HOLD"
    assert signal_from_z(0.2, "short", cfg) == "EXIT"
    assert signal_from_z(1.0, "short", cfg) == "HOLD"
    assert signal_from_z(9.9, "long", cfg) == "EXIT"
    assert signal_from_z(None, "flat", cfg) == "NO TRADE"
    assert signal_from_z(float("nan"), "long", cfg) == "HOLD"


def test_explain_signal_payload():
    cfg = StrategyConfig()
    e = explain_signal("LONG SPREAD", -2.0, 1500.0, 2000.0, 300.0, cfg)
    assert e["signal"] == "LONG SPREAD"
    assert e["z"] == -2.0 and e["filters_ok"] and "z=-2.00" in e["rationale"]
    e2 = explain_signal("NO TRADE", float("nan"), 1500.0, None, None, cfg)
    assert "insufficient history" in e2["rationale"]


def test_backtest_costs_and_pnl_accounting():
    cfg = StrategyConfig(
        lookback_days=30,
        min_hist_days=15,
        z_entry=0.5,
        z_exit=0.1,
        max_holding_days=100,
        lots_per_leg=2,
        costs=None,
    )
    # force a deliberate entry: spread starts far from base then mean reverts
    sf = synthetic_spread_frame(120, seed=7)
    sf.loc[sf.index[:5], "spread"] -= 4000.0
    sf["far_close"] = sf["near_close"] + sf["spread"]

    res = run_backtest(sf, "GOLD", cfg, segment_name="test")
    assert res.metrics is not None
    assert res.metrics.total_cost_rupees is None, "costs=None => no cost rows"
    for tr in res.trades:
        mult = get_spec("GOLD").rvalue_per_lot_per_quote_unit * cfg.lots_per_leg
        if tr.gross_pnl_rupees is not None:
            sign = 1.0 if tr.direction == "long" else -1.0
            np.testing.assert_allclose(
                tr.gross_pnl_rupees, sign * (tr.exit_spread - tr.entry_spread) * mult, rtol=1e-9
            )


def test_backtest_with_configured_costs():
    from quant.config import CostInput

    cfg = StrategyConfig(
        lookback_days=30,
        min_hist_days=15,
        z_entry=0.5,
        z_exit=0.1,
        max_holding_days=100,
        costs=CostInput(
            brokerage_rupees_per_lot=50.0,
            exchange_transaction_rupees_per_lot=118.0,
        ),
    )
    sf = synthetic_spread_frame(120, seed=7)
    sf.loc[sf.index[:5], "spread"] -= 4000.0
    sf["far_close"] = sf["near_close"] + sf["spread"]
    res = run_backtest(sf, "GOLD", cfg, segment_name="test")
    if res.metrics.n_trades > 0:
        assert res.metrics.total_cost_rupees > 0
        assert res.metrics.net_pnl_rupees is not None


def test_execution_delay_prevents_lookahead():
    cfg = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=0.3, z_exit=0.0, max_holding_days=400)
    sf = synthetic_spread_frame(90, seed=3)
    sf.loc[sf.index[:3], "spread"] -= 3000.0
    sf["far_close"] = sf["near_close"] + sf["spread"]
    res = run_backtest(sf, "GOLD", cfg)
    for tr in res.trades:
        assert tr.entry_exec_date > tr.entry_signal_date, "fills must occur AFTER signal day"


def test_train_test_split_purged_chronological():
    cfg = StrategyConfig(lookback_days=20, min_hist_days=15, train_fraction=0.5, min_test_days=10)
    sf = synthetic_spread_frame(100)
    train, test, note = split_train_test(sf, cfg)
    assert note is None
    assert train["trade_date"].max() < test["trade_date"].min()
    assert len(train) + len(test) <= 100  # purge gap removes some rows


def test_single_day_is_not_a_backtest():
    cfg = StrategyConfig(lookback_days=30, min_hist_days=15)
    sf = synthetic_spread_frame(1)
    res = run_backtest(sf, "GOLD", cfg)
    assert res.n_sessions == 1
    assert len(res.trades) == 0
    assert res.metrics is not None
    assert res.metrics.sharpe_ratio is None
    assert res.metrics.win_rate is None
    assert any("NOT a valid backtest" in n for n in res.metrics.notes)


def make_bhavcopy_csv(path: Path) -> None:
    dates = ["16 Oct 2026", "17 Oct 2026"]
    rows = [
        "Date,Instrument Name,Symbol,Expiry Date,Option Type,Strike Price,Open,High,Low,Close,Previous Close,Volume(Lots),Volume(In 000's),Value(Lacs),Open Interest(Lots)",
        f'"{dates[0]}","FUTCOM","GOLD      ","04DEC2026","-","0",147900,148000,147800,147918,147700,"2500","2500.000 KGS  ","3698","2600"',
        f'"{dates[0]}","FUTCOM","GOLD      ","05FEB2027","-","0",150300,150400,150200,150364,150100,"1800","1800.000 KGS  ","2707","2400"',
        f'"{dates[0]}","FUTCOM","GOLDM     ","05NOV2026","-","0",146400,146500,146300,146425,146200,"800","800.000 KGS  ","1171.4","900"',
        f'"{dates[0]}","OPTFUT","GOLD      ","04DEC2026","CE","148000",20,21,19,20.5,20,"500","500.000 KGS  ","1","1"',
        f'"{dates[1]}","FUTCOM","GOLD      ","04DEC2026","-","0",147950,148100,147850,148050,147918,"2600","2600.000 KGS  ","3849","2610"',
        f'"{dates[1]}","FUTCOM","GOLD      ","05FEB2027","-","0",150340,150450,150250,150410,150364,"1810","1810.000 KGS  ","2723","2405"',
    ]
    path.write_text("\n".join(rows), encoding="utf-8")


def test_bhavcopy_loader_cleaning(tmp_path: Path):
    csv = tmp_path / "bhav.csv"
    make_bhavcopy_csv(csv)
    df = load_bhavcopy([csv])
    assert len(df) == 5  # option row dropped; 5 FUTCOM rows retained
    assert (df["instrument"].str.strip() == "FUTCOM").all()
    # dedupe and date parsing
    assert df["trade_date"].nunique() == 2
    wide = df.pivot_table(index="trade_date", columns="expiry_ts", values="close")
    assert wide.shape[0] == 2


def test_eligibility_filters(tmp_path: Path):
    csv = tmp_path / "bhav.csv"
    make_bhavcopy_csv(csv)
    df = load_bhavcopy([csv])
    cfg = StrategyConfig()
    day = df["trade_date"].max()
    elig = eligible_contracts(df, day, cfg.liquidity)
    gold = elig[elig["symbol"] == "GOLD"]
    assert (gold["eligible"]).all()
    assert gold["expiry_ts"].nunique() == 2

def synthetic_eligible_day(base_close: float = 147_000.0) -> pd.DataFrame:
    d = pd.Timestamp("2026-10-16")
    rows = []
    for exp, delta in [(pd.Timestamp("2026-12-04"), 0.0), (pd.Timestamp("2027-01-05"), 1361.0)]:
        rows.append(
            dict(
                trade_date=d, expiry_ts=exp, symbol="GOLD", instrument="FUTCOM",
                open=base_close + delta, high=base_close + delta + 100, low=base_close + delta - 100,
                close=base_close + delta, value_lakhs=5000.0, volume_lots=2000.0,
                open_interest_lots=9000.0,
            )
        )
    return pd.DataFrame(rows)


def test_reject_missing_contract_metadata():
    day = synthetic_eligible_day()
    day.loc[:, "symbol"] = "GOLDRANDOM"
    from quant.spreads import select_pair
    assert select_pair(day) is None


def test_pair_spreads_raises_on_unknown_symbol():
    from quant.spreads import pair_spreads
    with pytest.raises(ValueError):
        pair_spreads(synthetic_eligible_day(), "GOLDRANDOM", pd.Timestamp("2026-12-04"), pd.Timestamp("2027-01-05"))


def test_reject_invalid_prices_in_spread():
    from quant.spreads import pair_spreads
    day = synthetic_eligible_day()
    day.loc[0, "close"] = -5.0
    day.loc[0, "far_close"] = np.nan
    report: dict[str, int] = {}
    out = pair_spreads(day, "GOLD", pd.Timestamp("2026-12-04"), pd.Timestamp("2027-01-05"), report=report)
    assert report["invalid_price_rows_dropped"] == 1, "invalid price row must be excluded, not prefilled"
    assert len(out) == 0, "no fabricated spread may remain when the only row was invalid"


def test_reject_insufficient_history_signal():
    cfg = StrategyConfig(lookback_days=30, min_hist_days=15)
    from quant.signals import signal_from_z, explain_signal
    assert signal_from_z(float("nan"), "flat", cfg) == "NO TRADE"
    e = explain_signal("NO TRADE", float("nan"), 1361.0, None, None, cfg)
    assert "insufficient history" in e["rationale"]
    assert e["z"] is None and e["mean"] is None and e["std"] is None


def test_reject_stale_contract_for_pair():
    from quant.spreads import select_pair
    day = synthetic_eligible_day()
    day.loc[day["expiry_ts"] == pd.Timestamp("2026-12-04"), "volume_lots"] = 0.0
    daily = day.assign(eligible=True)
    pick = select_pair(daily)
    if pick is not None:
        (near, _far), _sym = pick
        assert near == pd.Timestamp("2027-01-05"), "stale zero-volume mark cannot anchor near leg"


def test_reject_expiry_outside_headroom(tmp_path: Path):
    csv = tmp_path / "bh.csv"
    make_bhavcopy_csv(csv)
    df = load_bhavcopy([csv])
    cfg = StrategyConfig()
    elig = eligible_contracts(df, df["trade_date"].max(), cfg.liquidity)
    near_exps = elig[(elig["symbol"] == "GOLDM") & (elig["expiry_ts"] == pd.Timestamp("2026-10-31"))]
    assert near_exps.empty or not (near_exps["eligible"].all()), "too-near expiry must be rejected"


def test_thresholds_are_configurable():
    cfg_loose = StrategyConfig(z_entry=5.0, z_exit=4.0, stop_z=9.0)
    cfg_tight = StrategyConfig(z_entry=0.1, z_exit=0.05, stop_z=0.2)
    from quant.signals import signal_from_z
    assert signal_from_z(1.0, "flat", cfg_loose) == "NO TRADE"
    assert signal_from_z(1.0, "flat", cfg_tight) == "SHORT SPREAD"
    assert signal_from_z(0.6, "flat", cfg_loose) == "NO TRADE"
    assert signal_from_z(0.6, "flat", cfg_tight) == "SHORT SPREAD"


def test_loader_flags_stale_rows(tmp_path: Path):
    csv = tmp_path / "bh2.csv"
    base_line = '"16 Oct 2026","FUTCOM","GOLD      ","04DEC2026","-","0",147900,148000,147800,147918,147700,"0","0.000 KGS  ","0","16717"'
    header = "Date,Instrument Name,Symbol,Expiry Date,Option Type,Strike Price,Open,High,Low,Close,Previous Close,Volume(Lots),Volume(In 000's),Value(Lacs),Open Interest(Lots)"
    csv.write_text("".join([header, "\n", base_line, "\n"]), encoding="utf-8")
    df = load_bhavcopy([csv])
    assert df["stale"].iloc[0] is True or bool(df["stale"].iloc[0])


# ---------------------------------------------------------------------------
# Pass 11 — Gold Futures Pair Construction Regression Tests
# ---------------------------------------------------------------------------

def test_pair_spreads_rejects_inverted_expiries():
    """Near expiry must be strictly earlier than far expiry."""
    near = pd.Timestamp("2027-01-05")
    far = pd.Timestamp("2026-12-04")  # inverted!
    frame = pd.DataFrame([
        {"trade_date": pd.Timestamp("2026-10-16"), "symbol": "GOLDM", "expiry_ts": near, "close": 149227.0, "volume_lots": 1000.0},
        {"trade_date": pd.Timestamp("2026-10-16"), "symbol": "GOLDM", "expiry_ts": far, "close": 147866.0, "volume_lots": 10000.0},
    ])
    with pytest.raises(ValueError, match="must be strictly earlier than far_expiry"):
        pair_spreads(frame, "GOLDM", near, far)

    # Identical expiries also rejected
    with pytest.raises(ValueError, match="must be strictly earlier than far_expiry"):
        pair_spreads(frame, "GOLDM", near, near)


def test_pair_spreads_missing_price_drops_date_not_zero():
    """A missing price on one leg must drop that date, never treat it as zero."""
    d1 = pd.Timestamp("2026-10-16")
    d2 = pd.Timestamp("2026-10-19")
    near_exp = pd.Timestamp("2026-12-04")
    far_exp = pd.Timestamp("2027-01-05")

    frame = pd.DataFrame([
        # Day 1: both legs present and priced
        {"trade_date": d1, "symbol": "GOLDM", "expiry_ts": near_exp, "close": 147866.0, "volume_lots": 10000.0},
        {"trade_date": d1, "symbol": "GOLDM", "expiry_ts": far_exp, "close": 149227.0, "volume_lots": 1000.0},
        # Day 2: near leg present, far leg NaN close
        {"trade_date": d2, "symbol": "GOLDM", "expiry_ts": near_exp, "close": 147229.0, "volume_lots": 10000.0},
        {"trade_date": d2, "symbol": "GOLDM", "expiry_ts": far_exp, "close": float("nan"), "volume_lots": 1000.0},
    ])
    sf = pair_spreads(frame, "GOLDM", near_exp, far_exp)
    # Day 2 must NOT appear with spread = 0 - 147229 = -147229
    assert len(sf) == 1
    assert sf.iloc[0]["trade_date"] == d1
    assert sf.iloc[0]["spread"] == 1361.0  # 149227 - 147866


def test_pair_spread_sign_convention():
    """Spread convention is strictly far_close - near_close."""
    d = pd.Timestamp("2026-10-16")
    near_exp = pd.Timestamp("2026-12-04")
    far_exp = pd.Timestamp("2027-01-05")

    frame = pd.DataFrame([
        {"trade_date": d, "symbol": "GOLDM", "expiry_ts": near_exp, "close": 147866.0, "volume_lots": 10000.0},
        {"trade_date": d, "symbol": "GOLDM", "expiry_ts": far_exp, "close": 149227.0, "volume_lots": 1000.0},
    ])
    sf = pair_spreads(frame, "GOLDM", near_exp, far_exp)
    expected = 149227.0 - 147866.0  # far - near = +1361.0
    assert sf.iloc[0]["spread"] == expected
    assert sf.iloc[0]["spread"] > 0, "normal carry spread is positive for gold"


def test_gold_scaling_and_lot_values():
    """Verified lot size and monetary scaling for GOLD (1kg) vs GOLDM (100g)."""
    spec_gold = get_spec("GOLD")
    spec_goldm = get_spec("GOLDM")

    # GOLD: 1000g lot, 10g quote basis -> rvalue = 100
    assert spec_gold.lot_size_g == 1000.0
    assert spec_gold.quote_basis_g == 10.0
    assert spec_gold.rvalue_per_lot_per_quote_unit == 100.0

    # GOLDM: 100g lot, 10g quote basis -> rvalue = 10
    assert spec_goldm.lot_size_g == 100.0
    assert spec_goldm.quote_basis_g == 10.0
    assert spec_goldm.rvalue_per_lot_per_quote_unit == 10.0

    # P&L per rupee of spread change:
    # 1 lot of GOLD moves by Rs 100 per Rs 1 spread change
    # 1 lot of GOLDM moves by Rs 10 per Rs 1 spread change
    quote_diff = 5.0  # Rs 5 per 10g
    pnl_gold = quote_diff * spec_gold.rvalue_per_lot_per_quote_unit * 1
    pnl_goldm = quote_diff * spec_goldm.rvalue_per_lot_per_quote_unit * 1
    assert pnl_gold == 500.0
    assert pnl_goldm == 50.0
