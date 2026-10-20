"""Eligibility selection: which contracts are comparable & tradeable today."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import LiquidityFilter
from .contracts import has_spec


def eligible_contracts(
    frame: pd.DataFrame,
    trade_date: pd.Timestamp,
    filt: LiquidityFilter,
    allowed_symbols: tuple[str, ...] = ("GOLD", "GOLDM"),
) -> pd.DataFrame:
    """Return the subset of contracts eligible for trading on ``trade_date``.

    Rules (all configurable through ``filt``):
    - symbol must have VERIFIED contract metadata (contracts registry) and be
      in the allowed list (no unverified symbols ever trade)
    - price sanity: close must be positive & finite; high >= low
      (rows failing sanity are rejected as invalid_price, never corrected)
    - liquidity: volume, open interest and traded value floors
    - expiry headroom: min days-to-expiry avoids delivery-window effects;
      max days-to-expiry avoids thin far-tenor marks without real liquidity.
    """
    day = frame[frame["trade_date"] == trade_date]
    if day.empty:
        return day.assign(eligible=False, reason="no_data_for_date")
    dte = (day["expiry_ts"] - day["trade_date"]).dt.days
    price_ok = day["close"].notna() & day["expiry_ts"].notna()
    positive_close = price_ok & (day["close"].fillna(0) > 0) & day["close"].apply(np.isfinite)
    sane_ohlc = price_ok & (
        day["high"].isna() | day["low"].isna() | (day["high"] >= day["low"])
    )
    checks = (
        day["symbol"].isin(allowed_symbols)
        & day["symbol"].apply(has_spec)
        & day["close"].notna()
        & day["expiry_ts"].notna()
        & (day["volume_lots"].fillna(0) >= filt.min_volume_lots)
        & (day["open_interest_lots"].fillna(0) >= filt.min_open_interest_lots)
        & (day["value_lakhs"].fillna(0) >= filt.min_traded_value_lakhs)
        & (dte >= filt.min_days_to_expiry)
        & (dte <= filt.max_days_to_expiry)
        & positive_close
        & sane_ohlc
    )
    day = day.assign(eligible=checks)
    day = day.assign(
        dte_days=dte,
        reason=day.apply(
            lambda r: "eligible" if r["eligible"] else _disqualify_reason(r, filt, dte.loc[r.name]),  # type: ignore[arg-type, union-attr]
            axis=1,
        ),
    )
    return day.sort_values(["symbol", "expiry_ts"]).reset_index(drop=True)


def _disqualify_reason(row: pd.Series, filt: LiquidityFilter, dte: float | int | None) -> str:
    reasons: list[str] = []
    close = row.get("close")
    if row["symbol"] not in ("GOLD", "GOLDM") or not has_spec(row["symbol"]):
        reasons.append("symbol_not_verified")
    if pd.isna(close) or pd.isna(row["expiry_ts"]):
        reasons.append("no_valid_price_or_expiry")
        return "|".join(reasons)
    try:
        if float(close) <= 0 or not np.isfinite(float(close)):
            reasons.append("invalid_price")
    except (TypeError, ValueError):
        reasons.append("invalid_price")
    if pd.notna(row["high"]) and pd.notna(row["low"]) and row["high"] < row["low"]:
        reasons.append("invalid_price")
    if dte is not None:
        if dte < filt.min_days_to_expiry:
            reasons.append(f"dte<{filt.min_days_to_expiry}")
        elif dte > filt.max_days_to_expiry:
            reasons.append(f"dte>{filt.max_days_to_expiry}")
    vol = 0.0 if pd.isna(row["volume_lots"]) else row["volume_lots"]
    oi = 0.0 if pd.isna(row["open_interest_lots"]) else row["open_interest_lots"]
    val = 0.0 if pd.isna(row["value_lakhs"]) else row["value_lakhs"]
    if vol < filt.min_volume_lots:
        reasons.append(f"vol<{filt.min_volume_lots}")
    if oi < filt.min_open_interest_lots:
        reasons.append(f"oi<{filt.min_open_interest_lots}")
    if val < filt.min_traded_value_lakhs:
        reasons.append(f"value<{filt.min_traded_value_lakhs}")
    return "|".join(reasons) if reasons else "unfiltered"


