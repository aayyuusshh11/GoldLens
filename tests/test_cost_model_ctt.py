"""CTT (Commodities Transaction Tax) cost-model tests.

The statutory rate is verified, not assumed: 0.01% (1 bps) of the SELL side's
trade value, payable by the seller, for non-agricultural commodity futures
(Finance Act 2013 s.117, effective 1 Jul 2013; GOLD/GOLDM bullion is not in
the exempt agri list). Sources recorded in docs/COST_MODEL.md.

Pass 10 additions — verified charges:
- Exchange transaction charge: Rs 2.10 per lakh of turnover (= 0.0021%),
  per MCX circular implementing SEBI/HO/MRD/TPD-1/P/CIR/2024/92 (True-to-Label,
  issued 1 Jul 2024, effective 1 Oct 2024). Applies to both buy and sell sides.
  GST at 18% levied on top of the exchange transaction charge.
- Stamp duty: 0.002% (= 0.2 bps) on the BUY side only, per Indian Stamp
  (Collection of Stamp-Duty through Stock Exchanges, Clearing Corporations and
  Depositories) Rules 2019, effective 1 Jul 2020 (Finance Act 2019 amendment
  to Indian Stamp Act 1899 §9A). Collected by exchange as agent for buyer's
  state government. Applied once per event on the buying leg only.
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
from quant.engine import _cost_one_event, run_backtest
from tests.test_backtest import trending_then_reverting


def test_ctt_unit_computation_hand_calc():
    cost = CostInput(
        brokerage_rupees_per_lot=10.0,
        exchange_transaction_rupees_per_lot=100.0,
        ctt_bps_on_sell_turnover=1.0,  # 0.01%
    )
    cfg = StrategyConfig(costs=cost)
    # GOLD: rvalue = 100 per quote unit per lot
    rv = get_spec("GOLD").rvalue_per_lot_per_quote_unit
    assert rv == 100.0
    base = _cost_one_event(cfg, "GOLD", 1, leg_quote=100_000.0)
    # no sell leg quoted -> no CTT yet
    np.testing.assert_allclose(
        base,
        10.0 * 1 + 100.0 * 1 + 100.0 * 1 * 0.18,
        rtol=1e-9,
    )
    with_sell = _cost_one_event(cfg, "GOLD", 1, leg_quote=100_000.0, sell_leg_quote=100_000.0)
    np.testing.assert_allclose(
        with_sell,
        base + 0.0001 * 100_000.0 * rv * 1,
        rtol=1e-9,
    )


def test_ctt_only_sums_on_sell_leg_legs():
    cost = CostInput(
        brokerage_rupees_per_lot=0.0,
        exchange_transaction_rupees_per_lot=0.0,
        ctt_bps_on_sell_turnover=1.0,
    )
    cfg = StrategyConfig(costs=cost)
    sell_only = _cost_one_event(cfg, "GOLD", 1, leg_quote=100_000.0, sell_leg_quote=100_000.0)
    other = _cost_one_event(cfg, "GOLD", 1, leg_quote=105_000.0, sell_leg_quote=None)
    np.testing.assert_allclose(sell_only, 0.0001 * 100_000.0 * 100.0, rtol=1e-9)
    np.testing.assert_allclose(other, 0.0, rtol=1e-9)


def test_ctt_side_aware_engine_entry_sells_near_for_long(tmp_path):
    """Entry of a LONG spread sells NEAR -> the CTT charge must reference the
    near leg's value, not the far leg (asymmetry check)."""
    cost_zero = CostInput(brokerage_rupees_per_lot=0.0, exchange_transaction_rupees_per_lot=0.0,
                          ctt_bps_on_sell_turnover=0.0)
    cost_ctt = CostInput(brokerage_rupees_per_lot=0.0, exchange_transaction_rupees_per_lot=0.0,
                         ctt_bps_on_sell_turnover=1.0)
    cfg0 = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=0.2, z_exit=0.05,
                          max_holding_days=500, costs=cost_zero)
    cfg1 = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=0.2, z_exit=0.05,
                          max_holding_days=500, costs=cost_ctt)
    sf = trending_then_reverting(150)
    r0 = run_backtest(sf, "GOLD", cfg0)
    r1 = run_backtest(sf, "GOLD", cfg1)
    assert r1.trades, "expected trades to verify side mapping"
    rv = get_spec("GOLD").rvalue_per_lot_per_quote_unit
    lots = cfg1.lots_per_leg
    near_by_date = {str(d.date()): float(v) for d, v in
                    zip(pd.DatetimeIndex(sf["trade_date"]), sf["near_close"])}
    far_by_date = {str(d.date()): float(v) for d, v in
                   zip(pd.DatetimeIndex(sf["trade_date"]), sf["far_close"])}
    expected_ctt = 0.0
    charged_daily = r1.daily_costs.fillna(0.0) - r0.daily_costs.fillna(0.0)
    for tr in r1.trades:
        state = tr.direction
        # entry: long -> sell NEAR, short -> sell FAR
        leg = near_by_date if state == "long" else far_by_date
        d = str(tr.entry_exec_date.date())
        expected_ctt += 0.0001 * leg[d] * rv * lots
        if tr.exit_reason != "end_of_data":
            # exit flips the sold leg: long -> sell FAR, short -> sell NEAR
            leg_exit = far_by_date if state == "long" else near_by_date
            d2 = str(tr.exit_exec_date.date())
            expected_ctt += 0.0001 * leg_exit[d2] * rv * lots
    charged_total = float(charged_daily.sum())
    np.testing.assert_allclose(charged_total, expected_ctt, rtol=1e-9)


def test_ctt_unconfigured_flags_net_incomplete():
    cost = CostInput(brokerage_rupees_per_lot=10.0, exchange_transaction_rupees_per_lot=100.0)
    cfg = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=0.2, z_exit=0.05,
                         max_holding_days=500, costs=cost)
    res = run_backtest(trending_then_reverting(150), "GOLD", cfg)
    assert "NOT CONFIGURED" in res.diagnostics["ctt_status"]


def test_ctt_configured_zero_still_flags_complete():
    cost = CostInput(brokerage_rupees_per_lot=10.0, exchange_transaction_rupees_per_lot=100.0,
                     ctt_bps_on_sell_turnover=0.0)
    cfg = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=0.2, z_exit=0.05,
                         max_holding_days=500, costs=cost)
    res = run_backtest(trending_then_reverting(150), "GOLD", cfg)
    assert res.diagnostics["ctt_status"] == "configured"


def test_no_costsrecord_means_gross_only_diagnostics():
    cfg = StrategyConfig(lookback_days=30, min_hist_days=15, z_entry=0.2, z_exit=0.05,
                         max_holding_days=500)
    res = run_backtest(trending_then_reverting(150), "GOLD", cfg)
    assert res.diagnostics["metrics_basis"] == "gross_only_costs_missing"
    assert "ctt_status" not in res.diagnostics


# ---------------------------------------------------------------------------
# Pass 10 — verified exchange transaction charge and stamp duty tests
# ---------------------------------------------------------------------------

def test_exchange_txn_bps_on_turnover_hand_calc():
    """Exchange transaction charge: Rs 2.10 per lakh = 0.0021% of leg value.

    Verified source: MCX circular implementing SEBI/HO/MRD/TPD-1/P/CIR/2024/92
    (True-to-Label, issued 1 Jul 2024, effective 1 Oct 2024).
    GST at 18% is applied on the exchange transaction charge (same as legacy).

    Hand-calc for GOLD, 1 lot, leg_quote = 100_000 Rs/10g:
      leg_value = 100_000 * 100 (rvalue) * 1 = 10_000_000 Rs
      exchange_txn = 0.0021% * 10_000_000 = 210.0 Rs
      gst_on_txn = 210.0 * 0.18 = 37.80 Rs
      brokerage = 10.0 Rs
      total = 10.0 + 210.0 + 37.80 = 257.80 Rs
    """
    cost = CostInput(
        brokerage_rupees_per_lot=10.0,
        exchange_transaction_rupees_per_lot=0.0,  # not used when bps field is set
        exchange_transaction_bps_on_turnover=0.21,  # 0.0021% = 2.10/lakh
    )
    cfg = StrategyConfig(costs=cost)
    rv = get_spec("GOLD").rvalue_per_lot_per_quote_unit  # 100.0
    leg_quote = 100_000.0
    leg_value = leg_quote * rv * 1
    expected_txn = 0.0021 / 100.0 * leg_value  # = 210.0
    expected_total = 10.0 + expected_txn + expected_txn * 0.18  # brokerage + txn + GST
    result = _cost_one_event(cfg, "GOLD", 1, leg_quote=leg_quote)
    np.testing.assert_allclose(result, expected_total, rtol=1e-9,
                               err_msg="exchange_transaction_bps_on_turnover hand-calc mismatch")


def test_exchange_txn_bps_overrides_per_lot_field():
    """When exchange_transaction_bps_on_turnover is set, exchange_transaction_rupees_per_lot
    is ignored (the verified field takes priority over the legacy field)."""
    cost_legacy = CostInput(
        brokerage_rupees_per_lot=0.0,
        exchange_transaction_rupees_per_lot=500.0,  # large legacy value
    )
    cost_bps = CostInput(
        brokerage_rupees_per_lot=0.0,
        exchange_transaction_rupees_per_lot=500.0,   # should be ignored
        exchange_transaction_bps_on_turnover=0.21,   # overrides
    )
    cfg_legacy = StrategyConfig(costs=cost_legacy)
    cfg_bps = StrategyConfig(costs=cost_bps)
    rv = get_spec("GOLD").rvalue_per_lot_per_quote_unit
    leg_quote = 100_000.0
    result_legacy = _cost_one_event(cfg_legacy, "GOLD", 1, leg_quote=leg_quote)
    result_bps = _cost_one_event(cfg_bps, "GOLD", 1, leg_quote=leg_quote)
    # legacy: 500*1 + 500*0.18 = 590.0
    np.testing.assert_allclose(result_legacy, 500.0 * 1.18, rtol=1e-9)
    # bps: leg_value = 100_000 * 100 = 1e7; txn = 0.0021% * 1e7 = 210; total = 210 * 1.18
    expected_bps = 0.0021 / 100.0 * (leg_quote * rv) * 1.18
    np.testing.assert_allclose(result_bps, expected_bps, rtol=1e-9)
    assert abs(result_legacy - result_bps) > 100, "bps and legacy should differ substantially here"


def test_stamp_duty_buy_side_only_hand_calc():
    """Stamp duty: 0.002% (0.2 bps) on the BUY side only.

    Verified source: Indian Stamp (Collection…) Rules 2019 (Finance Act 2019
    amendment to Indian Stamp Act 1899 §9A), effective 1 Jul 2020.
    Rate: 0.002% of buy-side turnover value.

    Hand-calc for GOLD, 1 lot, leg_quote = 100_000 Rs/10g:
      leg_value = 100_000 * 100 = 10_000_000 Rs
      stamp_duty (buy side) = 0.002% * 10_000_000 = 200.0 Rs
      stamp_duty (sell side) = 0 Rs  (not charged on sell side)
    """
    cost = CostInput(
        brokerage_rupees_per_lot=0.0,
        exchange_transaction_rupees_per_lot=0.0,
        stamp_duty_buy_side_bps_on_turnover=0.2,  # 0.002% = 0.2 bps
    )
    cfg = StrategyConfig(costs=cost)
    rv = get_spec("GOLD").rvalue_per_lot_per_quote_unit
    leg_quote = 100_000.0
    leg_value = leg_quote * rv * 1
    # buy side — stamp applies
    buy_cost = _cost_one_event(cfg, "GOLD", 1, leg_quote=leg_quote, is_buy_side=True)
    expected_buy = 0.002 / 100.0 * leg_value
    np.testing.assert_allclose(buy_cost, expected_buy, rtol=1e-9)
    # sell side — stamp does not apply
    sell_cost = _cost_one_event(cfg, "GOLD", 1, leg_quote=leg_quote, is_buy_side=False)
    np.testing.assert_allclose(sell_cost, 0.0, rtol=1e-9)


def test_stamp_duty_buy_side_overrides_legacy_both_sides():
    """stamp_duty_buy_side_bps_on_turnover overrides stamp_duty_bps_on_turnover.
    The new field (buy-side only) takes priority when non-None."""
    cost_legacy = CostInput(
        brokerage_rupees_per_lot=0.0,
        exchange_transaction_rupees_per_lot=0.0,
        stamp_duty_bps_on_turnover=0.2,  # legacy: applied to both sides
    )
    cost_new = CostInput(
        brokerage_rupees_per_lot=0.0,
        exchange_transaction_rupees_per_lot=0.0,
        stamp_duty_bps_on_turnover=0.2,            # present but overridden
        stamp_duty_buy_side_bps_on_turnover=0.2,   # overrides on buy; zero on sell
    )
    cfg_l = StrategyConfig(costs=cost_legacy)
    cfg_n = StrategyConfig(costs=cost_new)
    leg_quote = 100_000.0
    rv = get_spec("GOLD").rvalue_per_lot_per_quote_unit
    expected_both = 0.002 / 100.0 * leg_quote * rv
    # legacy: both buy and sell sides pay stamp
    np.testing.assert_allclose(
        _cost_one_event(cfg_l, "GOLD", 1, leg_quote, is_buy_side=True), expected_both, rtol=1e-9)
    np.testing.assert_allclose(
        _cost_one_event(cfg_l, "GOLD", 1, leg_quote, is_buy_side=False), expected_both, rtol=1e-9)
    # new: only buy side pays stamp
    np.testing.assert_allclose(
        _cost_one_event(cfg_n, "GOLD", 1, leg_quote, is_buy_side=True), expected_both, rtol=1e-9)
    np.testing.assert_allclose(
        _cost_one_event(cfg_n, "GOLD", 1, leg_quote, is_buy_side=False), 0.0, rtol=1e-9)


def test_full_verified_cost_model_hand_calc():
    """Full end-to-end cost model reconciliation against a hand-calculated example.

    Charges and sources (all verified, effective Oct 2024):
      - Brokerage: Rs 50/lot (illustrative; broker-specific, UNVERIFIED).
      - Exchange txn: 0.0021% of leg turnover (Rs 2.10/lakh).
        Source: MCX circular, SEBI/HO/MRD/TPD-1/P/CIR/2024/92, eff 1 Oct 2024.
      - GST on exchange txn: 18% (statutory).
      - Stamp duty: 0.002% on BUY side only.
        Source: Indian Stamp Rules 2019 / Finance Act 2019 §9A, eff 1 Jul 2020.
      - CTT: 0.01% (1 bps) on SELL side only.
        Source: Finance Act 2013 §117, eff 1 Jul 2013.

    Hand-calc for GOLD, 1 lot, entry LONG spread
    (far = buy side, near = sell side):
      near_quote = 100_000, far_quote = 101_000, rvalue = 100
      --- FAR LEG (BUY side for LONG entry) ---
      far_value = 101_000 * 100 = 10_100_000
      brokerage_far = 50.0
      exchange_txn_far = 0.0021% * 10_100_000 = 212.10
      gst_far = 212.10 * 0.18 = 38.178
      stamp_far (buy side) = 0.002% * 10_100_000 = 202.0
      ctt_far = 0 (far is the buy leg for LONG entry)
      far_total = 50 + 212.10 + 38.178 + 202.0 = 502.278
      --- NEAR LEG (SELL side for LONG entry) ---
      near_value = 100_000 * 100 = 10_000_000
      brokerage_near = 50.0
      exchange_txn_near = 0.0021% * 10_000_000 = 210.0
      gst_near = 210.0 * 0.18 = 37.80
      stamp_near (sell side) = 0 (buy-side stamp only)
      ctt_near = 0.01% * 10_000_000 = 100.0 (near is sold leg for LONG)
      near_total = 50 + 210 + 37.80 + 0 + 100 = 397.80
      --- TOTAL per event ---
      event_total = 502.278 + 397.80 = 900.078
    """
    rv = get_spec("GOLD").rvalue_per_lot_per_quote_unit  # 100.0
    near_quote, far_quote = 100_000.0, 101_000.0
    far_value = far_quote * rv
    near_value = near_quote * rv

    brokerage = 50.0
    exch_bps = 0.21   # 0.0021% = Rs 2.10 per lakh
    stamp_bps = 0.2   # 0.002% buy-side
    ctt_bps = 1.0     # 0.01% sell-side
    gst = 0.18

    far_txn = exch_bps / 10_000.0 * far_value
    near_txn = exch_bps / 10_000.0 * near_value
    far_stamp = stamp_bps / 10_000.0 * far_value   # far is buy side (LONG entry)
    ctt_near = ctt_bps / 10_000.0 * near_value     # near is sold leg for LONG entry

    expected_far = brokerage + far_txn + far_txn * gst + far_stamp
    expected_near = brokerage + near_txn + near_txn * gst + ctt_near
    expected_total = expected_far + expected_near

    cost = CostInput(
        brokerage_rupees_per_lot=brokerage,
        exchange_transaction_rupees_per_lot=0.0,
        exchange_transaction_bps_on_turnover=exch_bps,
        stamp_duty_buy_side_bps_on_turnover=stamp_bps,
        ctt_bps_on_sell_turnover=ctt_bps,
        gst_rate_on_transaction_charges=gst,
    )
    cfg = StrategyConfig(costs=cost)
    # far (buy side, no CTT)
    far_cost = _cost_one_event(cfg, "GOLD", 1, far_quote, sell_leg_quote=None, is_buy_side=True)
    np.testing.assert_allclose(far_cost, expected_far, rtol=1e-9,
                               err_msg="far (buy) leg cost mismatch")
    # near (sell side, CTT applies)
    near_cost = _cost_one_event(cfg, "GOLD", 1, near_quote,
                                sell_leg_quote=near_quote, is_buy_side=False)
    np.testing.assert_allclose(near_cost, expected_near, rtol=1e-9,
                               err_msg="near (sell) leg cost mismatch")
    np.testing.assert_allclose(far_cost + near_cost, expected_total, rtol=1e-9,
                               err_msg="total event cost hand-calc mismatch")


def test_legacy_cost_fields_unchanged_backward_compat():
    """Existing tests using exchange_transaction_rupees_per_lot and
    stamp_duty_bps_on_turnover (both-sides legacy) continue to produce
    the same results as before Pass 10."""
    cost = CostInput(
        brokerage_rupees_per_lot=40.0,
        exchange_transaction_rupees_per_lot=118.0,
        stamp_duty_bps_on_turnover=3.0,
        slippage_ticks=2.0,
    )
    cfg = StrategyConfig(costs=cost)
    rv = get_spec("GOLD").rvalue_per_lot_per_quote_unit
    leg_quote = 100_000.0
    leg_value = leg_quote * rv * 1
    txn = 118.0 * 1
    stamp = 3.0 / 10_000.0 * leg_value
    slip = 2.0 * 1.0 * rv * 1
    expected = 40.0 + txn + stamp + txn * 0.18 + slip
    result = _cost_one_event(cfg, "GOLD", 1, leg_quote)
    np.testing.assert_allclose(result, expected, rtol=1e-9,
                               err_msg="legacy cost fields backward-compat broken")


# ---------------------------------------------------------------------------
# Pass 11 — Comprehensive event side mapping tests (Entry/Exit, Long/Short)
# ---------------------------------------------------------------------------

def test_short_spread_entry_cost_mapping():
    """Entry of a SHORT spread: sell FAR, buy NEAR.
    - Near is BUY side -> stamp duty applies to Near leg.
    - Far is SELL side -> CTT applies to Far leg.
    """
    cost = CostInput(
        brokerage_rupees_per_lot=20.0,
        exchange_transaction_rupees_per_lot=0.0,
        exchange_transaction_bps_on_turnover=0.21,  # 0.0021%
        stamp_duty_buy_side_bps_on_turnover=0.2,    # 0.002% buy only
        ctt_bps_on_sell_turnover=1.0,               # 0.01% sell only
    )
    cfg = StrategyConfig(costs=cost)
    rv = get_spec("GOLDM").rvalue_per_lot_per_quote_unit  # 10.0
    near_quote = 147_000.0
    far_quote = 148_500.0
    near_val = near_quote * rv
    far_val = far_quote * rv

    # Entry SHORT: near is buy, far is sell
    near_cost = _cost_one_event(cfg, "GOLDM", 1, near_quote, sell_leg_quote=None, is_buy_side=True)
    far_cost = _cost_one_event(cfg, "GOLDM", 1, far_quote, sell_leg_quote=far_quote, is_buy_side=False)

    # Near leg: brokerage + txn + gst + stamp (no CTT)
    near_txn = 0.0021 / 100.0 * near_val
    expected_near = 20.0 + near_txn * 1.18 + (0.002 / 100.0 * near_val)
    np.testing.assert_allclose(near_cost, expected_near, rtol=1e-9)

    # Far leg: brokerage + txn + gst + CTT (no stamp)
    far_txn = 0.0021 / 100.0 * far_val
    expected_far = 20.0 + far_txn * 1.18 + (0.01 / 100.0 * far_val)
    np.testing.assert_allclose(far_cost, expected_far, rtol=1e-9)


def test_long_spread_exit_cost_mapping():
    """Exit of a LONG spread: close trade by selling FAR, buying NEAR.
    - Far is SELL side -> CTT applies to Far leg.
    - Near is BUY side -> stamp duty applies to Near leg.
    """
    cost = CostInput(
        brokerage_rupees_per_lot=15.0,
        exchange_transaction_rupees_per_lot=0.0,
        exchange_transaction_bps_on_turnover=0.21,
        stamp_duty_buy_side_bps_on_turnover=0.2,
        ctt_bps_on_sell_turnover=1.0,
    )
    cfg = StrategyConfig(costs=cost)
    rv = get_spec("GOLDM").rvalue_per_lot_per_quote_unit
    near_quote = 147_500.0
    far_quote = 149_000.0
    near_val = near_quote * rv
    far_val = far_quote * rv

    # Exit LONG: far is sold (closing long far), near is bought (closing short near)
    far_cost = _cost_one_event(cfg, "GOLDM", 1, far_quote, sell_leg_quote=far_quote, is_buy_side=False)
    near_cost = _cost_one_event(cfg, "GOLDM", 1, near_quote, sell_leg_quote=None, is_buy_side=True)

    expected_far = 15.0 + (0.0021 / 100.0 * far_val) * 1.18 + (0.01 / 100.0 * far_val)
    expected_near = 15.0 + (0.0021 / 100.0 * near_val) * 1.18 + (0.002 / 100.0 * near_val)
    np.testing.assert_allclose(far_cost, expected_far, rtol=1e-9)
    np.testing.assert_allclose(near_cost, expected_near, rtol=1e-9)


def test_short_spread_exit_cost_mapping():
    """Exit of a SHORT spread: close trade by selling NEAR, buying FAR.
    - Near is SELL side -> CTT applies to Near leg.
    - Far is BUY side -> stamp duty applies to Far leg.
    """
    cost = CostInput(
        brokerage_rupees_per_lot=15.0,
        exchange_transaction_rupees_per_lot=0.0,
        exchange_transaction_bps_on_turnover=0.21,
        stamp_duty_buy_side_bps_on_turnover=0.2,
        ctt_bps_on_sell_turnover=1.0,
    )
    cfg = StrategyConfig(costs=cost)
    rv = get_spec("GOLDM").rvalue_per_lot_per_quote_unit
    near_quote = 147_500.0
    far_quote = 149_000.0
    near_val = near_quote * rv
    far_val = far_quote * rv

    # Exit SHORT: near is sold (closing long near), far is bought (closing short far)
    near_cost = _cost_one_event(cfg, "GOLDM", 1, near_quote, sell_leg_quote=near_quote, is_buy_side=False)
    far_cost = _cost_one_event(cfg, "GOLDM", 1, far_quote, sell_leg_quote=None, is_buy_side=True)

    expected_near = 15.0 + (0.0021 / 100.0 * near_val) * 1.18 + (0.01 / 100.0 * near_val)
    expected_far = 15.0 + (0.0021 / 100.0 * far_val) * 1.18 + (0.002 / 100.0 * far_val)
    np.testing.assert_allclose(near_cost, expected_near, rtol=1e-9)
    np.testing.assert_allclose(far_cost, expected_far, rtol=1e-9)
