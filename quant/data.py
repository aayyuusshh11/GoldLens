"""Bhavcopy ingestion and cleaning. Handles single- and multi-day files."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Iterable

import pandas as pd

log = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parent.parent

REQUIRED_COLUMNS = [
    "date",
    "instrument",
    "symbol",
    "expiry_date",
    "open",
    "high",
    "low",
    "close",
    "previous_close",
    "volume_lots",
    "value_lakhs",
    "open_interest_lots",
]

_CANDIDATE_ALIASES = {
    "date": ["Date"],
    "instrument": ["Instrument Name"],
    "symbol": ["Symbol"],
    "expiry_date": ["Expiry Date"],
    "option_type": ["Option Type"],
    "strike_price": ["Strike Price"],
    "open": ["Open"],
    "high": ["High"],
    "low": ["Low"],
    "close": ["Close"],
    "previous_close": ["Previous Close"],
    "volume_lots": ["Volume(Lots)"],
    "value_lakhs": ["Value(Lacs)", "Value (Lakhs)", "Value(Lakhs)"],
    "open_interest_lots": ["Open Interest(Lots)"],
}


def find_bhavcopy_files(repo_root: Path | str | None = None) -> list[Path]:
    """Discover all genuine BhavCopy CSV files across the repository.

    Searches:
    1. Directory in GOLDLENS_DATA_DIR environment variable (if set)
    2. <repo_root>/data/raw/mcx/BhavCopyDateWise_*.csv (primary manual/automated intake)
    3. <repo_root>/BhavCopyDateWise_*.csv (root-level bhavcopies)

    Returns a sorted list of unique Path objects (deduplicated by resolved path).
    """
    root = Path(repo_root) if repo_root is not None else REPO_ROOT
    paths: list[Path] = []

    env_dir = os.environ.get("GOLDLENS_DATA_DIR")
    if env_dir:
        d = Path(env_dir).expanduser()
        if d.is_dir():
            paths.extend(d.glob("BhavCopyDateWise_*.csv"))
            sub_mcx = d / "data" / "raw" / "mcx"
            if sub_mcx.is_dir():
                paths.extend(sub_mcx.glob("BhavCopyDateWise_*.csv"))

    # Primary raw MCX directory
    mcx_dir = root / "data" / "raw" / "mcx"
    if mcx_dir.is_dir():
        paths.extend(mcx_dir.glob("BhavCopyDateWise_*.csv"))

    # Root directory (legacy / root drops)
    if root.is_dir():
        paths.extend(root.glob("BhavCopyDateWise_*.csv"))

    seen: set[Path] = set()
    unique: list[Path] = []
    for p in sorted(paths, key=lambda x: (x.name, str(x))):
        resolved = p.resolve()
        if resolved not in seen and p.is_file():
            seen.add(resolved)
            unique.append(p)
    return unique


def _dedup_key_score(sub: pd.DataFrame) -> pd.Series:
    """Rank records sharing one (trade_date, symbol, expiry) key.

    Conflict policy (the old keep-first default was wrong when two files
    carried the same row with one blank and one priced): keep the record with
    actual data. Exact ties keep the first occurrence in `paths` order.
    """
    has_vol = sub["volume_lots"].notna().astype(int)
    has_oi = sub["open_interest_lots"].notna().astype(int)
    has_close = sub["close"].notna().astype(int)
    return has_close * 4 + has_vol * 2 + has_oi * 1


def _conflict_aware_dedup(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Deduplicate (trade_date, symbol, expiry_ts) preferring priced records.

    Returns (frame, n_conflicts) where n_conflicts counts keys that had more
    than one record with *different* payloads (not exact duplicates).
    """
    key_cols = ["trade_date", "symbol", "expiry_ts"]
    dup_mask = df.duplicated(subset=key_cols, keep=False)
    if not dup_mask.any():
        return df.drop_duplicates(subset=key_cols, keep="first"), 0
    conflicts = 0
    clean_parts: list[pd.DataFrame] = []
    for _, grp in df[dup_mask].groupby(key_cols, sort=False):
        payload_cols = [c for c in df.columns if c not in key_cols]
        if len(grp.drop_duplicates(subset=payload_cols)) > 1:
            conflicts += 1
        keep_idx = _dedup_key_score(grp).idxmax()
        clean_parts.append(grp.loc[[keep_idx]])
    uniq = df[~dup_mask]
    clean_parts.insert(0, uniq)
    merged = pd.concat(clean_parts, ignore_index=True)
    merged = merged.drop_duplicates(subset=key_cols, keep="first")
    return merged, conflicts


def _parse_date(val: object) -> pd.Timestamp | None:
    try:
        return pd.Timestamp(str(val).strip())
    except Exception:
        return None


def _parse_expiry(val: object) -> pd.Timestamp | None:
    s = str(val).strip().upper()
    for fmt in ("%d%b%Y", "%d-%b-%Y", "%d%B%Y"):
        try:
            return pd.Timestamp(pd.to_datetime(s, format=fmt))
        except Exception:
            continue
    return None


def _parse_number(val: object) -> float:
    s = str(val).strip()
    if s in {"", "-", "0"} and not s.isdigit():
        return float("nan")
    s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return float("nan")


def load_bhavcopy(paths: Iterable[Path | str]) -> pd.DataFrame:
    """Load one or more bhavcopy CSVs into a normalized, cleaned frame.

    Cleaning rules (fail-safe, never fabricate):
    - drop non-FUTCOM rows (options excluded — this module trades futures)
    - drop rows whose close is missing/blank (untraded stale marks)
    - drop duplicate (date, symbol, expiry) records, conflict-aware: when
      two files disagree on the same key the priced record wins (see
      _conflict_aware_dedup); exact duplicates keep the first occurrence
    - drop expired contracts (expiry < trade date, i.e. unknown/stale expiry)
    - require instrument='FUTCOM', numeric parse errors -> NaN then filtered
    """
    frames: list[pd.DataFrame] = []
    for p in paths:
        path = Path(p)
        df = pd.read_csv(path, dtype=str)
        df.columns = [c.strip() for c in df.columns]
        ren = {}
        for canon, aliases in _CANDIDATE_ALIASES.items():
            for a in aliases:
                if a in df.columns:
                    ren[a] = canon
                    break
        df = df.rename(columns=ren)
        missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
        if missing:
            log.warning("%s: columns missing %s — file partially loaded", path, missing)
            continue
        df["source_file"] = str(path)
        frames.append(df)

    if not frames:
        raise ValueError("no loadable bhavcopy files supplied")

    raw = pd.concat(frames, ignore_index=True)

    raw["trade_date"] = raw["date"].map(_parse_date)
    raw["expiry_ts"] = raw["expiry_date"].map(_parse_expiry)
    raw["symbol"] = raw["symbol"].str.strip().str.upper()
    raw["close"] = raw["close"].map(_parse_number)
    raw["open"] = raw["open"].map(_parse_number)
    raw["high"] = raw["high"].map(_parse_number)
    raw["low"] = raw["low"].map(_parse_number)
    raw["volume_lots"] = raw["volume_lots"].map(_parse_number)
    raw["value_lakhs"] = raw["value_lakhs"].map(_parse_number)
    raw["open_interest_lots"] = raw["open_interest_lots"].map(_parse_number)

    df = raw[raw["instrument"].str.strip() == "FUTCOM"].copy()
    n_opts = len(raw) - len(df)
    df = df.dropna(subset=["trade_date", "expiry_ts", "close"])
    df = df[df["expiry_ts"] >= df["trade_date"]]
    df, n_conflicts = _conflict_aware_dedup(df)
    df = df.sort_values(["trade_date", "symbol", "expiry_ts"]).reset_index(drop=True)
    # stale = price present but the contract did NOT trade that session
    # (settlement-only mark). Kept for price reconstruction but never
    # treated as a tradable price by the eligibility gate.
    df = df.assign(stale=df["volume_lots"].fillna(0) <= 0)

    nan_numeric = int(df["open"].isna().sum() + df["high"].isna().sum() + df["low"].isna().sum())
    log.info(
        "loaded %d rows from %d files | option_rows_dropped=%d | key_conflicts_resolved=%d",
        len(df), len(frames), n_opts, n_conflicts,
    )
    if nan_numeric:
        log.info("%d rows have some blank pricing fields (kept, flagged)", nan_numeric)
    return df


def symbol_history(frame: pd.DataFrame, symbol: str) -> pd.DataFrame:
    """Pivot per-contract closes into a wide panel: index=trade_date,
    columns=expiry_ts, values=close."""
    sub = frame[frame["symbol"] == symbol.strip().upper()]
    if sub.empty:
        return pd.DataFrame()
    wide = sub.pivot_table(
        index="trade_date", columns="expiry_ts", values="close", aggfunc="first"
    ).sort_index()
    return wide


def volume_history(frame: pd.DataFrame, symbol: str) -> pd.DataFrame:
    sub = frame[frame["symbol"] == symbol.strip().upper()]
    if sub.empty:
        return pd.DataFrame()
    wide = sub.pivot_table(
        index="trade_date", columns="expiry_ts", values="volume_lots", aggfunc="first"
    ).sort_index()
    return wide
