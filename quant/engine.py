"""Event-loop backtesting engine for the calendar-spread strategy.

Conventions:
- signal(t) uses the rolling z computed ONLY from rows <= t (no look-ahead);
- execution happens at the NEXT available session close (t+1): an entry
  decided today is filled at today+1's close, never today's;
- position = 1:1 same-family pair (long spread = long far leg, short near
  leg). P&L per unit of quoted spread change
      rvalue * lots          (rvalue = lot_size_g / quote_basis_g)
- daily accounting is mark-to-market on spread deltas (entry day accrues 0,
  exit day accrues spread(exit_exec) - spread(previous session)); equity past
  sums exactly to realized per-trade gross P&L — no double counting;
- transaction costs are applied only when explicitly configured
  (cfg.costs is not None). Otherwise gross-only reporting with an explicit
  warning — costs are never silently assumed zero.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .config import CRITICAL_MISSING_COSTS, StrategyConfig
from .contracts import get_spec
from .metrics import MetricsResult, compute_metrics
from .signals import explain_signal, signal_from_z
from .zscore import rolling_zscore

log = logging.getLogger(__name__)

FLAT = "flat"


@dataclass
class TradeRecord:
    leg_symbol: str
    direction: str  # 'long' | 'short'
    entry_signal_date: pd.Timestamp
    entry_exec_date: pd.Timestamp
    entry_spread: float
    entry_z: float | None
    entry_rationale: str
    exit_exec_date: pd.Timestamp | None = None
    exit_spread: float | None = None
    exit_reason: str = ""
    exit_rationale: str = ""
    gross_pnl_rupees: float | None = None
    holding_days: int = 0


def _rvalue(symbol: str) -> float:
    return get_spec(symbol).rvalue_per_lot_per_quote_unit


def _cost_one_event(
    cfg: StrategyConfig, symbol: str, lots: int, leg_quote: float,
    sell_leg_quote: float | None = None,
    is_buy_side: bool = False,
) -> float:
    """Compute the total transaction cost for one execution event (one leg).

    ``leg_quote``      : the quoted close of this leg (Rs / quote basis).
    ``sell_leg_quote`` : the quoted close of the SOLD leg at this event; used
                         for CTT (charged only on the sell-side trade value).
    ``is_buy_side``    : True when this leg is the BUY side of the trade; used
                         for the buy-side-only stamp duty (Indian Stamp Act
                         1899 §9A, effective 1 Jul 2020).  When the legacy
                         ``stamp_duty_bps_on_turnover`` field is used (both-
                         sides mode) this flag has no effect on stamp duty.
    """
    c = cfg.costs
    assert c is not None
    leg_value = leg_quote * _rvalue(symbol) * lots

    # Exchange transaction charge — prefer the turnover-based (verified) field.
    if c.exchange_transaction_bps_on_turnover is not None:
        txn = c.exchange_transaction_bps_on_turnover / 10_000.0 * leg_value
    else:
        txn = c.exchange_transaction_rupees_per_lot * lots

    # Stamp duty — prefer the buy-side-only (verified) field.
    if c.stamp_duty_buy_side_bps_on_turnover is not None:
        stamp = (c.stamp_duty_buy_side_bps_on_turnover / 10_000.0 * leg_value
                 if is_buy_side else 0.0)
    else:
        stamp = c.stamp_duty_bps_on_turnover / 10_000.0 * leg_value

    ctt = 0.0
    if c.ctt_bps_on_sell_turnover is not None and sell_leg_quote is not None:
        sell_value = sell_leg_quote * _rvalue(symbol) * lots
        ctt = c.ctt_bps_on_sell_turnover / 10_000.0 * sell_value
    return (
        c.brokerage_rupees_per_lot * lots
        + txn
        + stamp
        + ctt
        + txn * c.gst_rate_on_transaction_charges
        + c.slippage_ticks * c.tick_size_rupees_per_quote_unit * _rvalue(symbol) * lots
    )


@dataclass
class BacktestResult:
    pair_symbol: str
    segment_name: str
    n_sessions: int
    daily_pnl_gross: pd.Series
    daily_costs: pd.Series | None
    positions: pd.Series
    trades: list[TradeRecord] = field(default_factory=list)
    explanations: list[dict[str, object]] = field(default_factory=list)
    metrics: MetricsResult | None = None
    diagnostics: dict[str, object] = field(default_factory=dict)

    def summary(self) -> dict[str, object]:
        d: dict[str, object] = {
            "pair_symbol": self.pair_symbol,
            "segment": self.segment_name,
            "sessions": self.n_sessions,
            "trades": len(self.trades),
        }
        if self.metrics:
            d |= self.metrics.to_dict()
        d |= self.diagnostics
        return d


def run_backtest(
    spread_frame: pd.DataFrame,
    symbol: str,
    cfg: StrategyConfig,
    segment_name: str = "full",
    filters_ok: pd.Series | None = None,
    filter_reasons: pd.Series | None = None,
) -> BacktestResult:
    """Run the calendar-spread strategy on one fixed (near, far) pair.

    ``spread_frame``: columns trade_date, near_close, far_close, spread — only
    days on which BOTH legs traded, chronological.
    ``filters_ok`` / ``filter_reasons``: optional per-trade_date eligibility
    gate (both legs eligible). New entries are blocked on failing days;
    open positions hold unless ``cfg.exit_on_filter_breach``.
    """
    cfg.validate()
    sf = spread_frame.sort_values("trade_date").reset_index(drop=True)
    n = len(sf)
    rv = _rvalue(symbol) * cfg.lots_per_leg

    spread = sf["spread"].astype(float).to_numpy()
    dates = pd.DatetimeIndex(sf["trade_date"])

    fill_gross = np.zeros(n)  # MTM daily P&L per session
    fill_costs = np.zeros(n)  # per-session transaction costs
    position_state = np.array([FLAT] * n, dtype=object)
    trades: list[TradeRecord] = []
    explanations: list[dict[str, object]] = []

    state = FLAT
    direction = 0.0
    entry_exec_i = -1
    entry_spread = np.nan
    hold_days = 0
    degrade_streak = 0

    zseries_cache = rolling_zscore(sf["spread"], cfg)
    z_all = zseries_cache["z"].to_numpy()
    mean_all = zseries_cache["mean"].to_numpy()
    std_all = zseries_cache["std"].to_numpy()

    ok_all: np.ndarray | None
    reasons: np.ndarray | None
    if filters_ok is not None:
        ok_all = filters_ok.reindex(dates).fillna(False).to_numpy()
        reasons = filter_reasons.reindex(dates).fillna("na").to_numpy() if filter_reasons is not None else None
    else:
        ok_all = None
        reasons = None

    ctt_missing_events = {"n": 0}

    def _sell_leg_quote(i_exec: int, entering: bool, state: str) -> float | None:
        near = float(sf.loc[i_exec, "near_close"])
        far = float(sf.loc[i_exec, "far_close"])
        if pd.isna(near) or pd.isna(far):
            if cfg.costs is not None and cfg.costs.ctt_bps_on_sell_turnover is not None:
                ctt_missing_events["n"] += 1
            return None
        # CTT charges the SELL leg's trade value. Entry of a long spread
        # sells NEAR (buy far / sell near); entry of a short spread sells
        # FAR. Exit closes the trade, flipping the sold leg: long -> sell
        # FAR, short -> sell NEAR.
        if entering:
            return near if state == "long" else far
        return far if state == "long" else near

    def trade_cost_event(i_exec: int, entering: bool = True, state: str = "flat") -> float:
        if cfg.costs is None:
            return 0.0
        sell_leg = _sell_leg_quote(i_exec, entering, state)
        near = float(sf.loc[i_exec, "near_close"])
        far = float(sf.loc[i_exec, "far_close"])
        # Buy-side identification for verified stamp-duty field:
        # Entry LONG  → buy FAR / sell NEAR  → far is buy, near is sell
        # Entry SHORT → sell FAR / buy NEAR  → near is buy, far is sell
        # Exit LONG   → sell FAR / buy NEAR  → near is buy, far is sell
        # Exit SHORT  → buy FAR / sell NEAR  → far is buy, near is sell
        if entering:
            far_is_buy = (state == "long")
        else:
            far_is_buy = (state == "short")
        far_cost = _cost_one_event(
            cfg, symbol, cfg.lots_per_leg, far,
            sell_leg_quote=sell_leg if sell_leg == far else None,
            is_buy_side=far_is_buy,
        )
        near_cost = _cost_one_event(
            cfg, symbol, cfg.lots_per_leg, near,
            sell_leg_quote=sell_leg if sell_leg == near else None,
            is_buy_side=not far_is_buy,
        )
        return far_cost + near_cost

    for t in range(n):
        z = z_all[t]
        date_t = dates[t]
        can_enter = True if ok_all is None else bool(ok_all[t])

        if reasons is not None and ok_all is not None and not ok_all[t]:
            degrade_streak += 1
        else:
            degrade_streak = 0

        signal = signal_from_z(z, state, cfg)

        if state != FLAT:
            hold_days = int((date_t - dates[entry_exec_i]).days)
            if hold_days >= cfg.max_holding_days:
                signal = "EXIT"
            if degrade_streak >= 2 and cfg.exit_on_filter_breach:
                signal = "EXIT"

        # ---- executed today (decision made at t-1's close) ----
        if (
            (signal in ("LONG SPREAD", "SHORT SPREAD"))
            and state == FLAT
            and can_enter
            and t + 1 < n
        ):
            state = "long" if signal == "LONG SPREAD" else "short"
            direction = 1.0 if state == "long" else -1.0
            entry_exec_i = t + 1
            entry_spread = float(spread[entry_exec_i])
            hold_days = 0
            fill_costs[entry_exec_i] += trade_cost_event(entry_exec_i, entering=True, state=state)
            trades.append(
                TradeRecord(
                    leg_symbol=symbol,
                    direction=state,
                    entry_signal_date=date_t,
                    entry_exec_date=dates[entry_exec_i],
                    entry_spread=entry_spread,
                    entry_z=None if pd.isna(z) else float(z),
                    entry_rationale=explain_signal(signal, z, spread[t], mean_all[t], std_all[t], cfg, position="flat")["rationale"],
                )
            )

        elif signal == "EXIT" and state != FLAT and t + 1 < n:
            exit_i = t + 1
            prev_spread = float(spread[exit_i - 1])
            if t > entry_exec_i:
                fill_gross[t] += direction * (spread[t] - spread[t - 1]) * rv
            exit_spread = float(spread[exit_i])
            gross = direction * (exit_spread - prev_spread) * rv
            fill_gross[exit_i] += gross
            fill_costs[exit_i] += trade_cost_event(exit_i, entering=False, state=state)
            open_tr = trades[-1]
            open_tr.exit_exec_date = dates[exit_i]
            open_tr.exit_spread = exit_spread
            open_tr.exit_reason = _exit_reason(signal, state, z, hold_days, degrade_streak, cfg)
            open_tr.exit_rationale = explain_signal(
                signal, z, spread[t], mean_all[t], std_all[t], cfg, position=state
            )["rationale"]
            open_tr.gross_pnl_rupees = float(gross + (direction * (prev_spread - entry_spread) * rv))
            open_tr.holding_days = int((dates[exit_i] - dates[entry_exec_i]).days)
            state = FLAT
            direction = 0.0
            entry_exec_i = -1
            entry_spread = np.nan
            hold_days = 0

        if state != FLAT and entry_exec_i >= 0 and t >= entry_exec_i:
            if t == entry_exec_i:
                fill_gross[t] += 0.0
            elif t > entry_exec_i:
                fill_gross[t] += direction * (spread[t] - spread[t - 1]) * rv
            # note: if the position exits at t (handled above), MTM for that
            # day is the realized closing delta already recorded there.

        position_state[t] = state

        explanations.append(
            explain_signal(
                signal, z, spread[t], mean_all[t], std_all[t], cfg,
                filters_ok=can_enter,
                filter_reason="" if reasons is None else str(reasons[t]),
                position=state,
            )
        )

    # force liquidate any remaining open position at the final session close
    if state != FLAT and entry_spread is not None and not np.isnan(entry_spread):
        exit_spread = float(spread[n - 1])
        open_tr = trades[-1]
        open_tr.exit_exec_date = dates[n - 1]
        open_tr.exit_spread = exit_spread
        open_tr.exit_reason = "end_of_data"
        open_tr.gross_pnl_rupees = float(direction * (exit_spread - entry_spread) * rv)
        open_tr.holding_days = int((dates[n - 1] - dates[entry_exec_i]).days)
        state = FLAT

    costs_series = pd.Series(0.0, index=dates) if cfg.costs is not None else None
    if cfg.costs is None:
        log.warning(
            "[%s] costs NOT configured — reporting gross P&L only (%s)",
            segment_name, CRITICAL_MISSING_COSTS,
        )
    gross_series = pd.Series(fill_gross, index=dates)
    if costs_series is not None:
        costs_series = costs_series + pd.Series(fill_costs, index=dates)

    acc = BacktestResult(
        pair_symbol=symbol,
        segment_name=segment_name,
        n_sessions=n,
        daily_pnl_gross=gross_series,
        daily_costs=costs_series,
        positions=pd.Series(position_state, index=dates),
        trades=trades,
        explanations=explanations,
        diagnostics={
            "lookback_days": cfg.lookback_days,
            "z_entry": cfg.z_entry,
            "z_exit": cfg.z_exit,
            "stop_z": cfg.stop_z,
            "max_holding_days": cfg.max_holding_days,
            "exit_on_filter_breach": cfg.exit_on_filter_breach,
            "costs_configured": cfg.costs is not None,
            "exec_mode": cfg.exec_mode,
            "lots_per_leg": cfg.lots_per_leg,
            "allow_overlap": cfg.allow_overlap,
        },
    )
    net_daily = gross_series if costs_series is None else gross_series - costs_series

    metrics_gross = compute_metrics(gross_series, costs_series, cfg, net_daily_pnl=net_daily)

    # trade-level statistics from realized trades instead of MTM days
    m = metrics_gross
    if trades:
        wins = sum(1 for tr in trades if tr.gross_pnl_rupees is not None and tr.gross_pnl_rupees > 0)
        m.n_trades = len(trades)
        m.win_rate = wins / len(trades)
        grosses = [tr.gross_pnl_rupees for tr in trades if tr.gross_pnl_rupees is not None]
        m.avg_pnl_per_trade = sum(grosses) / len(grosses) if grosses else None
    else:
        m.win_rate = None
        m.avg_pnl_per_trade = None

    acc.metrics = m
    acc.diagnostics["metrics_basis"] = "net" if costs_series is not None else "gross_only_costs_missing"
    acc.diagnostics["gross_daily_pnl_sum"] = float(gross_series.sum())
    acc.diagnostics["net_daily_pnl"] = None if costs_series is not None else None
    if costs_series is not None:
        acc.diagnostics["net_daily_pnl"] = float(net_daily.sum())
        if cfg.costs is not None and cfg.costs.ctt_bps_on_sell_turnover is None:
            acc.diagnostics["ctt_status"] = (
                "NOT CONFIGURED: statutory 0.01% seller-side CTT missing "
                "-> net figures understated, treat as incomplete"
            )
        else:
            acc.diagnostics["ctt_status"] = "configured"
        if ctt_missing_events["n"]:
            acc.diagnostics["ctt_events_skipped_missing_quote"] = ctt_missing_events["n"]
    return acc


def _exit_reason(
    signal: str,
    state: str,
    z: float,
    hold_days: int,
    degrade_streak: int,
    cfg: StrategyConfig,
) -> str:
    if abs(z) >= cfg.stop_z:
        return f"stop (|z|={z:.2f} >= {cfg.stop_z})"
    if state == "long" and z >= -cfg.z_exit:
        return f"mean_reversion (z={z:.2f} >= -z_exit={-cfg.z_exit})"
    if state == "short" and z <= cfg.z_exit:
        return f"mean_reversion (z={z:.2f} <= z_exit={cfg.z_exit})"
    if hold_days >= cfg.max_holding_days:
        return f"max_holding_days ({hold_days} >= {cfg.max_holding_days})"
    if degrade_streak >= 2 and cfg.exit_on_filter_breach:
        return "filter_breach"
    return signal.lower()


def split_train_test(
    spread_frame: pd.DataFrame, cfg: StrategyConfig
) -> tuple[pd.DataFrame, pd.DataFrame, str | None]:
    """Chronological split with a purge gap of one warmup window so z-scores
    near the boundary never straddle the split."""
    sf = spread_frame.sort_values("trade_date").reset_index(drop=True)
    n = len(sf)
    if n < 5:
        return sf, sf, f"insufficient_length={n}"
    cut = max(2, int(n * cfg.train_fraction))
    purge = cfg.lookback_days
    train = sf.iloc[: cut]
    test = sf.iloc[min(cut + purge, n):]
    note = None
    if len(test) < cfg.min_test_days:
        note = (
            f"test segment only {len(test)} rows (< {cfg.min_test_days}); "
            "expand history or lower train_fraction"
        )
    return train, test, note


def walk_forward(
    spread_frame: pd.DataFrame,
    symbol: str,
    cfg: StrategyConfig,
    n_folds: int = 3,
) -> list[BacktestResult]:
    """Expanding-window walk-forward. Each fold trains on data up to the fold
    boundary, then evaluates on the held-out tail with a warm-up purge."""
    from .zscore import warmup_days

    sf = spread_frame.sort_values("trade_date").reset_index(drop=True)
    n = len(sf)
    warm = warmup_days(cfg)
    if n < (warm + cfg.min_test_days) * 2:
        return []
    folds: list[BacktestResult] = []
    for k in range(1, n_folds + 1):
        end = int(n * (k + 1) / (n_folds + 1))
        fold = sf.iloc[:end]
        if len(fold) < warm + 2:
            continue
        res = run_backtest(fold, symbol, cfg, segment_name=f"wf_fold_{k}")
        folds.append(res)
    return folds


def compare_walk_forward(folds: list[BacktestResult]) -> list[dict[str, object]]:
    """Tabulate fold-by-fold results for cross-window comparison.

    Each entry is the fold's held-out-tail performance and the window bounds;
    folds are listed in chronological order so the columns show how the
    strategy's performance evolves as the estimation window grows.
    """
    rows: list[dict[str, object]] = []
    prev: dict[str, object] | None = None
    for i, res in enumerate(folds, start=1):
        m = res.metrics
        row: dict[str, object] = {
            "fold": res.segment_name,
            "sessions": res.n_sessions,
            "trades": len(res.trades),
            "basis": res.diagnostics.get("metrics_basis"),
            "gross_pnl": None if m is None else m.gross_pnl_rupees,
            "net_pnl": None if m is None or m.net_pnl_rupees is None else m.net_pnl_rupees,
            "win_rate": None if m is None else m.win_rate,
            "max_drawdown": None if m is None else m.max_drawdown_rupees,
            "sharpe": None if m is None else m.sharpe_ratio,
        }
        if prev is not None:
            gp_prev = prev.get("gross_pnl")
            gp = row["gross_pnl"]
            row["delta_gross_vs_prev_fold"] = (
                None if gp is None or prev is None else gp - gp_prev if gp_prev is not None else None
            )
        else:
            row["delta_gross_vs_prev_fold"] = None
        row["dates"] = (
            str(res.daily_pnl_gross.index.min().date()),
            str(res.daily_pnl_gross.index.max().date()),
        )
        rows.append(row)
        prev = row
    return rows
