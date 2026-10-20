"""Central, fully configurable strategy parameters.

Everything that could be tuned is a field here — thresholds, lookback,
holding rules, filters and (critically) transaction costs. Costs default to
``None``: the engine then refuses to compute net P&L rather than silently
assuming zero. Supply verified numbers via ``CostInput``.
"""
from __future__ import annotations

from dataclasses import dataclass, field

CRITICAL_MISSING_COSTS = "costs_not_configured"


@dataclass
class CostInput:
    """Per-side, per-contract transaction costs. All fields must be verified
    values supplied by the user; nothing here is assumed.

    Two styles of exchange-transaction-charge configuration coexist for
    backward compatibility:
    - ``exchange_transaction_rupees_per_lot`` (legacy): a fixed Rs amount
      per lot regardless of contract price. Still used by early tests that
      pre-date the SEBI uniform-fee circular.
    - ``exchange_transaction_bps_on_turnover`` (verified): 0.0021% of the
      leg's trade value (Rs 2.10 per lakh), effective 1 Oct 2024 per MCX's
      implementation of SEBI Circular SEBI/HO/MRD/TPD-1/P/CIR/2024/92
      (True-to-Label, 1 Jul 2024 issue / 1 Oct 2024 effective).
      When non-None this takes priority over the fixed-per-lot field.

    Stamp duty:
    - ``stamp_duty_bps_on_turnover`` (legacy): applied to both buy and sell
      legs. Kept for backward compatibility.
    - ``stamp_duty_buy_side_bps_on_turnover`` (verified): 0.002% on the
      BUY side's trade value only, per Indian Stamp (Collection …) Rules 2019
      (effective 1 Jul 2020, Finance Act 2019 amendment to Indian Stamp Act
      1899 §9A). When non-None this takes priority over the legacy field.
    """

    brokerage_rupees_per_lot: float
    exchange_transaction_rupees_per_lot: float
    stamp_duty_bps_on_turnover: float = 0.0
    gst_rate_on_transaction_charges: float = 0.18
    slippage_ticks: float = 0.0
    tick_size_rupees_per_quote_unit: float = 1.0  # MCX gold tick = Rs 1
    # Statutory: 0.01% (1 bps) on the SELL side's trade value for non-agri
    # commodity futures, payable by the seller (Finance Act 2013 s.117,
    # effective 1 Jul 2013; GOLD/GOLDM bullion is non-exempt).
    # None => not supplied: net P&L then stays flagged incomplete.
    # 0.0 only for a genuinely exempt window (pre-Jul-2013).
    ctt_bps_on_sell_turnover: float | None = None
    # VERIFIED exchange transaction charge: Rs 2.10 per lakh of turnover
    # (= 0.0021%), effective 1 Oct 2024, MCX circular implementing
    # SEBI/HO/MRD/TPD-1/P/CIR/2024/92 (True-to-Label uniform fee).
    # When non-None, overrides exchange_transaction_rupees_per_lot.
    # GST at gst_rate is still applied on top of this charge.
    exchange_transaction_bps_on_turnover: float | None = None
    # VERIFIED stamp duty: 0.002% of BUY-side trade value only (= 0.2 bps),
    # per Indian Stamp (Collection…) Rules 2019 effective 1 Jul 2020
    # (Finance Act 2019, §9A Indian Stamp Act 1899). Charged by the exchange
    # as collecting agent on behalf of the buyer's state government.
    # When non-None, overrides stamp_duty_bps_on_turnover (which incorrectly
    # applied to both sides).
    stamp_duty_buy_side_bps_on_turnover: float | None = None


@dataclass
class LiquidityFilter:
    min_volume_lots: int = 500
    min_open_interest_lots: int = 1000
    min_traded_value_lakhs: float = 100.0
    min_days_to_expiry: int = 21
    max_days_to_expiry: int = 365


@dataclass
class StrategyConfig:
    """Multipurpose config for signal generation and backtesting.

    spread family: only same-symbol calendar pairs by default. Cross-symbol
    pairs (GOLDM vs GOLD) are different bar-size products; require
    ``allow_cross_symbol=True`` AND matching tenor offsets to be enabled.
    """

    # signal parameters
    z_entry: float = 1.5
    z_exit: float = 0.5
    lookback_days: int = 30
    min_hist_days: int = max(15, 30 // 3)  # at least a third of lookback
    max_holding_days: int = 10
    stop_z: float = 3.5

    # filters
    liquidity: LiquidityFilter = field(default_factory=LiquidityFilter)
    allow_cross_symbol: bool = False  # never assume GOLD/GOLDM comparable
    exit_on_filter_breach: bool = False  # if True, force EXIT on sustained filter failure

    # position sizing (lots per leg, per side)
    lots_per_leg: int = 1

    # costs — None => engine reports gross only, warns, never assumes zero
    costs: CostInput | None = None

    # execution: filled price convention. Only "next_close" is supported —
    # the signal observed at sessions row t executes at the NEXT available
    # row's close (never at the same close that generated the signal).
    # Modes implying same-bar fills (e.g. "same_close") are rejected: without
    # intraday data they would let past signals execute on future information.
    exec_mode: str = "next_close"

    # the engine trades one calendar-spread pair at a time; overlapping
    # positions are disallowed. Set True only if a future engine version
    # implements portfolio-level overlapping pairs.
    allow_overlap: bool = False

    # walk-forward evaluation
    walk_forward_folds: int = 3

    # backtest evaluation
    train_fraction: float = 0.6
    min_test_days: int = 20
    min_days_for_sharpe: int = 20

    def validate(self) -> None:
        if self.lookback_days < self.min_hist_days:
            raise ValueError("lookback_days must be >= min_hist_days")
        if self.z_exit >= self.z_entry:
            raise ValueError("z_exit must be < z_entry")
        if self.stop_z <= self.z_entry:
            raise ValueError("stop_z must be > z_entry")
        if not 0 < self.train_fraction < 1:
            raise ValueError("train_fraction must be in (0, 1)")
        if self.lots_per_leg < 1:
            raise ValueError("lots_per_leg must be >= 1")
        if self.exec_mode != "next_close":
            raise ValueError(
                f"exec_mode {self.exec_mode!r} unsupported: only 'next_close' fills without "
                "look-ahead bias (no intraday data available for other conventions)"
            )
        if self.allow_overlap:
            raise ValueError(
                "allow_overlap unsupported by this engine: one open pair position at a time"
            )
        if self.walk_forward_folds < 2:
            raise ValueError("walk_forward_folds must be >= 2")
