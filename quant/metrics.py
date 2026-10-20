"""Backtest performance metrics. All are computed from actual trade series —
nothing is extrapolated. Sharpe is withheld (None) below config min_days."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .config import StrategyConfig


@dataclass
class MetricsResult:
    n_days: int
    gross_pnl_rupees: float
    net_pnl_rupees: float | None = None
    win_rate: float | None = None
    max_drawdown_rupees: float | None = None
    net_max_drawdown_rupees: float | None = None
    sharpe_ratio: float | None = None
    net_sharpe_ratio: float | None = None
    total_cost_rupees: float | None = None
    n_trades: int = 0
    avg_pnl_per_trade: float | None = None
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        d = self.__dict__.copy()
        return d


def compute_metrics(
    daily_pnl: pd.Series,
    costs: pd.Series | None,
    cfg: StrategyConfig,
    net_daily_pnl: pd.Series | None = None,
) -> MetricsResult:
    """Compute metrics from the daily GROSS P&L series.

    ``daily_pnl``     : per-day GROSS P&L in rupees (index sorted)
    ``costs``         : per-day transaction costs in rupees (or None)
    ``net_daily_pnl`` : per-day NET P&L (gross − costs); when supplied, net
                        variants of P&L / drawdown / Sharpe are computed on
                        the net equity curve so risk numbers reflect real
                        drag once costs are configured. Never assumed when
                        costs are missing — net fields stay None.
    """
    pnl = daily_pnl.fillna(0.0).astype(float).sort_index()
    n_days = int(len(pnl))

    gross = float(pnl.sum())
    cost_total = float(costs.reindex(pnl.index).fillna(0.0).sum()) if costs is not None else None

    net_series = None
    if net_daily_pnl is not None and cost_total is not None:
        net_series = net_daily_pnl.reindex(pnl.index).fillna(0.0).astype(float)
        net = float(net_series.sum())
    else:
        net = None

    equity = pnl.cumsum()
    max_dd = float((equity - equity.cummax()).min()) if len(equity) > 0 else None

    net_max_dd: float | None = None
    net_sharpe: float | None = None
    if net_series is not None:
        net_equity = net_series.cumsum()
        net_max_dd = float((net_equity - net_equity.cummax()).min()) if len(net_equity) > 0 else None
        if n_days >= cfg.min_days_for_sharpe:
            std = net_series.std(ddof=1)
            if std and not np.isnan(std) and std > 0:
                net_sharpe = float(net_series.mean() / std * (252 ** 0.5))

    sharpe: float | None = None
    if n_days >= cfg.min_days_for_sharpe:
        std = pnl.std(ddof=1)
        if std and not np.isnan(std) and std > 0:
            sharpe = float(pnl.mean() / std * (252 ** 0.5))

    return MetricsResult(
        n_days=n_days,
        gross_pnl_rupees=gross,
        net_pnl_rupees=net,
        max_drawdown_rupees=max_dd,
        net_max_drawdown_rupees=net_max_dd,
        sharpe_ratio=sharpe,
        net_sharpe_ratio=net_sharpe,
        total_cost_rupees=cost_total,
        notes=notes(sharpe, n_days, cfg, cost_total),
    )


def notes(sharpe: float | None, n_days: int, cfg: StrategyConfig, cost_total: float | None) -> list[str]:
    out: list[str] = []
    if sharpe is None:
        out.append(
            f"Sharpe withheld: only {n_days} daily observations (< {cfg.min_days_for_sharpe} required); "
            "estimates on such a short window are not statistically meaningful."
        )
    if cost_total is None:
        out.append("Net P&L withheld: costs not configured (config.costs is None).")
    if n_days >= 1 and n_days < cfg.min_days_for_sharpe:
        out.append(
            f"Only {n_days} day(s) of history — these figures are diagnostics, NOT a valid backtest."
        )
    return out
