"""Causal rolling z-score of the spread series.

Strictly uses information up to and including the signal day; there is no
window re-centering around future observations, so signal(t) computed here
would be identical to running the live system on day t.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import StrategyConfig


def rolling_zscore(spread: pd.Series, cfg: StrategyConfig) -> pd.DataFrame:
    """Return (z, mean, std) aligned to spread.index with min_periods enforced.

    std of 0 or NaN yields NaN z (NO TRADE, not a fabricated value).
    """
    window = cfg.lookback_days
    mean = spread.rolling(window=window, min_periods=cfg.min_hist_days).mean()
    std = spread.rolling(window=window, min_periods=cfg.min_hist_days).std(ddof=1)
    eps = 1e-12
    z = (spread - mean).divide(std.replace(0.0, np.nan) + eps)
    out = pd.DataFrame({"spread": spread, "mean": mean, "std": std, "z": z})
    return out


def warmup_days(cfg: StrategyConfig) -> int:
    """Days of history z-scores need before the first effective signal."""
    return int(cfg.min_hist_days) + 1
