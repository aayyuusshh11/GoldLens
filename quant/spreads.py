"""Calendar spread computation between eligible same-family contracts.

Formulas (also documented in docs/SPREAD_ENGINE.md):
- calendar_spread(t) = far_close(t) - near_close(t)      [Rs per 10 g]
Both legs MUST belong to one verified contract family (same symbol, same
lot size and quote basis). Cross-symbol mixing is rejected.

Rejections (loud, never silently substituted):
- unknown contract family (no verified spec)  -> ValueError
- expired / null expiry, null close rows      -> dropped upstream (data.py)
- stale marks (volume == 0 for either leg)    -> flagged, excluded from
  entries via the eligibility filter; a close without traded volume is a
  settlement-only mark and is NOT treated as a tradable price
- invalid prices (close <= 0 / non-finite)    -> row excluded
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from .contracts import has_spec

log = logging.getLogger(__name__)


def _valid_price(x: float | object) -> bool:
    try:
        return pd.notna(x) and np.isfinite(float(x)) and float(x) > 0
    except (TypeError, ValueError):
        return False


def select_pair(
    eligible_day: pd.DataFrame, require_spec: bool = True
) -> tuple[tuple[pd.Timestamp, pd.Timestamp], str] | None:
    """Pick the canonical (near, far) pair for one trade date.

    Near = earliest eligible expiry that ACTUALLY TRADED that day
    (volume > 0 — a stale settlement mark cannot anchor the front leg).
    Far = the next eligible expiry after near. Both must be the same
    symbol and, when ``require_spec``, a verified contract family.
    Returns ((near, far), symbol) or None with a logged reason.
    """
    if eligible_day is None or eligible_day.empty:
        log.debug("select_pair: no eligible data")
        return None
    ok = eligible_day[
        eligible_day.get("eligible", False)
        if "eligible" in eligible_day.columns
        else pd.Series(True, index=eligible_day.index)
    ]
    for sym, group in ok.groupby("symbol"):
        if require_spec and not has_spec(sym):
            log.debug("select_pair: symbol %s has no verified spec -> rejected", sym)
            continue
        ok_rows = group[group["close"].map(_valid_price) & group["expiry_ts"].notna()]
        if ok_rows.empty:
            continue
        expiries = sorted(ok_rows["expiry_ts"].unique())
        traded = [
            e
            for e in expiries
            if float(ok_rows[ok_rows["expiry_ts"] == e]["volume_lots"].fillna(0).iloc[0]) > 0
        ]
        if len(traded) >= 2:
            return (traded[0], traded[1]), sym
        if len(traded) == 1 and len(expiries) >= 2:
            near = traded[0]
            far_candidates = [e for e in expiries if e > near]
            if far_candidates:
                return (near, far_candidates[0]), sym
    return None


def pair_spreads(
    frame: pd.DataFrame,
    symbol: str,
    near_expiry: pd.Timestamp,
    far_expiry: pd.Timestamp,
    report: dict[str, int] | None = None,
) -> pd.DataFrame:
    """Historical spread series for a fixed (near, far) SAME-SYMBOL pair.

    spread(t) = far_close(t) - near_close(t)   [Rs per 10 g]

    Only days on which BOTH legs have a valid, positive close are kept;
    a missing leg on a day yields NO row (no forward/backward filling —
    missing values are never silently substituted). If either symbol lacks
    verified contract metadata a ValueError is raised.
    """
    if not has_spec(symbol):
        raise ValueError(
            f"pair_spreads: no verified contract metadata for {symbol!r}; refusing to build spreads"
        )
    if near_expiry >= far_expiry:
        raise ValueError(
            f"pair_spreads: near_expiry ({near_expiry.date()}) must be strictly earlier than "
            f"far_expiry ({far_expiry.date()})"
        )
    near = frame[(frame["symbol"] == symbol) & (frame["expiry_ts"] == near_expiry)][
        ["trade_date", "close", "volume_lots"]
    ].rename(columns={"close": "near_close", "volume_lots": "near_volume"})
    far = frame[(frame["symbol"] == symbol) & (frame["expiry_ts"] == far_expiry)][
        ["trade_date", "close", "volume_lots"]
    ].rename(columns={"close": "far_close", "volume_lots": "far_volume"})
    if near.empty or far.empty:
        raise ValueError(
            f"pair_spreads: empty leg — symbol {symbol} "
            f"near={near_expiry.date()} rows={len(near)}, far={far_expiry.date()} rows={len(far)}"
        )
    merged = near.merge(far, on="trade_date", how="inner").sort_values("trade_date")
    invalid = ~(merged["near_close"].map(_valid_price) & merged["far_close"].map(_valid_price))
    if report is not None:
        report["invalid_price_rows_dropped"] = int(invalid.sum())
    if invalid.any():
        log.warning("pair %s: dropping %d invalid-price rows", symbol, int(invalid.sum()))
        merged = merged[~invalid]
    stale = (merged["near_volume"].fillna(0) <= 0) | (merged["far_volume"].fillna(0) <= 0)
    if report is not None:
        report["stale_rows_flagged"] = int(stale.sum())
    merged["stale"] = stale
    merged["spread"] = merged["far_close"] - merged["near_close"].astype(float)
    return merged[["trade_date", "near_close", "far_close", "near_volume", "far_volume", "stale", "spread"]].reset_index(drop=True)
