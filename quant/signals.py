"""Signal generation with full human-readable explanations."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import StrategyConfig


def signal_from_z(z: float | None, position: str, cfg: StrategyConfig) -> str:
    """Map a z-score and current position to an actionable signal label.

    Labels: LONG SPREAD | SHORT SPREAD | EXIT | NO TRADE | HOLD
    If z is unavailable (insufficient history / zero std) the rule is:
    - flat -> NO TRADE
    - in position -> HOLD (engine exits on calendar max-hold or stop rule
      once data returns; we never act on fabricated z values)
    """
    if z is None or pd.isna(z):
        return "NO TRADE" if position == "flat" else "HOLD"
    if position == "flat":
        if z <= -cfg.z_entry:
            return "LONG SPREAD"
        if z >= cfg.z_entry:
            return "SHORT SPREAD"
        return "NO TRADE"
    if abs(z) >= cfg.stop_z:
        return "EXIT"
    if position == "long":
        return "EXIT" if z >= -cfg.z_exit else "HOLD"
    if position == "short":
        return "EXIT" if z <= cfg.z_exit else "HOLD"
    return "NO TRADE"


def explain_signal(
    signal: str,
    z: float | None,
    spread: float,
    mean: float | None,
    std: float | None,
    cfg: StrategyConfig,
    filters_ok: bool = True,
    filter_reason: str = "",
    position: str = "flat",
) -> dict[str, object]:
    """A complete, self-contained explanation record for one signal."""
    z_clean: float | None = None if z is None or pd.isna(z) else float(z)
    mean_clean = None if mean is None or pd.isna(mean) else float(mean)
    std_clean = None if std is None or pd.isna(std) else float(std)
    if not filters_ok:
        signal = "HOLD" if position != "flat" else "NO TRADE"
    parts: list[str] = []
    if not filters_ok:
        parts.append(f"filters failed: {filter_reason}")
    elif z is None or (isinstance(z, float) and np.isnan(z)):
        parts.append(
            f"insufficient history for roll z (need >= {cfg.min_hist_days}d, lookback {cfg.lookback_days}d)"
        )
    else:
        side = "wide" if z >= cfg.z_entry else ("narrow" if z <= -cfg.z_entry else "mid-range")
        mean_s = "n/a" if mean_clean is None else f"{mean_clean:,.0f}"
        std_s = "n/a" if std_clean is None else f"{std_clean:,.0f}"
        parts.append(
            f"z={z:+.2f} vs entry +/-{cfg.z_entry:.2f} (spread {spread:,.0f}, mean {mean_s}, std {std_s}) {side}"
        )
    return {
        "signal": signal,
        "z": z_clean,
        "spread": float(spread),
        "mean": mean_clean,
        "std": std_clean,
        "filters_ok": bool(filters_ok),
        "filter_reason": filter_reason,
        "position_before": position,
        "rationale": "; ".join(parts) if parts else signal,
    }
