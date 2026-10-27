"""Backend integration adapter for the GoldLens FastAPI service.

Implements exactly the service contract that
``backend/app/services/quant_interface.py`` (Araham's backend, branch
``backend``) loads through ``GOLDLENS_QUANT_PACKAGE``:

    module exposes get_quant_service() -> object with
        analyze_signal(pair_id: str, as_of_date: str) -> dict
        run_backtest(pair_id: str, start_date: str, end_date: str,
                     strategy_version: str) -> dict

pair_id format (same regex the backend validates first):
    ``{SYMBOL}_near{YYYYMMDD}_far{YYYYMMDD}``, e.g.
    ``GOLDM_near20261204_far20270105``.

Everything here reuses the existing quant engine (verified specs, causal
rolling z, next-close execution, no-look-ahead); nothing is recomputed
differently. No market data, spec, cost, signal or P&L is ever fabricated:

- spread convention: ``far_close - near_close`` (Rs per 10 g quote basis),
  matching the engine, quant/api.py and the backend's API_CONTRACT section 4
  wording (their reference implementation computes near - far — flagged).
- decision enum (their §5): LONG SPREAD  -> SELL_NEAR_BUY_FAR
                               SHORT SPREAD -> BUY_NEAR_SELL_FAR
  (long the spread = long far leg, short near leg: profits when
  far - near rises; the mean-reversion engine goes long when z <= -z_entry).
- z is the causal rolling z at as_of (never interpolated/forward-filled).
- gross_edge (only when z is available): modeled per-lot rupee P&L if the
  spread mean-reverts to its rolling mean, i.e. (mean - spread) * rvalue *
  lots for a LONG decision, (spread - mean) * rvalue * lots for a SHORT
  decision. It is a MODEL quantity and is always labeled as such in notes.
- estimated_cost / net_edge stay None until verified CostInput values are
  supplied via cfg (net P&L is deliberately never assumed).
"""
from __future__ import annotations

import os
import re
import threading
from pathlib import Path
from typing import Any

import pandas as pd

from .api import load_dataset
from .config import StrategyConfig
from .contracts import get_spec, has_spec
from .data import find_bhavcopy_files
from .engine import run_backtest
from .run_quant import compute_daily_filters
from .spreads import pair_spreads

PAIR_ID_RE = re.compile(
    r"^(?P<symbol>[A-Z0-9]+)_near(?P<near>\d{8})_far(?P<far>\d{8})$"
)

DECISION_NO_TRADE = "NO_TRADE"
DECISION_SELL_NEAR_BUY_FAR = "SELL_NEAR_BUY_FAR"  # engine LONG SPREAD
DECISION_BUY_NEAR_SELL_FAR = "BUY_NEAR_SELL_FAR"  # engine SHORT SPREAD

MIN_SPREAD_OBSERVATIONS = 30  # agreed minimum (API_CONTRACT §10.2)
STRATEGY_VERSIONS = {"default"}

_ENV_DATA_DIR = "GOLDLENS_DATA_DIR"


def _parse_pair_id(pair_id: str) -> tuple[str, str, str] | None:
    m = PAIR_ID_RE.match(str(pair_id))
    if not m:
        return None
    near = f"{m['near'][:4]}-{m['near'][4:6]}-{m['near'][6:]}"
    far = f"{m['far'][:4]}-{m['far'][4:6]}-{m['far'][6:]}"
    return m["symbol"], near, far


def _source_paths() -> list[Path]:
    return find_bhavcopy_files()


def load_frame() -> pd.DataFrame:
    """Repo bhavcopy files through the existing validated loader.

    Cached after first load: the backend calls the service on every request
    and re-reading + re-validating the source CSVs each time is pure latency.
    The double-checked lock keeps two simultaneous cold requests from both
    re-running the ingest-side validation. A restart (or new ingest drop)
    picks up newly added files.
    """
    global _FRAME_CACHE
    if _FRAME_CACHE is None:
        with _FRAME_LOCK:
            if _FRAME_CACHE is None:
                _FRAME_CACHE = load_dataset(_source_paths()).frame
    return _FRAME_CACHE


_FRAME_CACHE: pd.DataFrame | None = None
_FRAME_LOCK = threading.Lock()


def warmup() -> None:
    """Preload + validate the repo dataset before any request arrives.

    Called by the backend during startup when this package is wired (see
    backend/app/services/quant_interface.warm_quant_service): moves the
    multi-second initial load/validation out of the request path, so the
    first signal/backtest call is fast. The cache is process-local; new files
    dropped after this loaded require a restart (by design — validated data
    never silently changes under a running server).
    """
    load_frame()


class GoldlensQuantService:
    """Quant-owned formulas; emits backend-shaped dicts, never raw engines."""

    def __init__(self, cfg: StrategyConfig | None = None):
        self.cfg = cfg or StrategyConfig()

    # ----------------------------- helpers ------------------------------

    def _pair_frame(
        self, parsed: tuple[str, str, str], frame: pd.DataFrame, report: dict[str, int]
    ) -> pd.DataFrame | None:
        symbol, near, far = parsed
        try:
            return pair_spreads(
                frame, symbol, pd.Timestamp(near), pd.Timestamp(far), report
            )
        except ValueError:
            return None

    def _dq(self, frame: pd.DataFrame | None) -> dict[str, Any]:
        if frame is None or frame.empty:
            return {"trading_days_available": 0}
        return {
            "trading_days_available": int(frame["trade_date"].nunique()),
            "latest_data_date": str(frame["trade_date"].max().date()),
        }

    # ------------------------- analyze_signal ---------------------------

    def analyze_signal(
        self,
        pair_id: str,
        as_of_date: str,
        *,
        frame: pd.DataFrame | None = None,
    ) -> dict[str, Any]:
        """Engine-backed signal at as_of. Nulls + reason codes, no invention."""
        parsed = _parse_pair_id(pair_id)
        base: dict[str, Any] = {
            "spread": None,
            "z_score": None,
            "gross_edge": None,
            "estimated_cost": None,  # net fields stay withheld until verified costs
            "net_edge": None,
            "decision": DECISION_NO_TRADE,
            "reason_codes": [],
        }
        if parsed is None:
            base["reason_codes"] = ["PAIR_UNKNOWN_FORMAT"]
            return base
        symbol, near, far = parsed
        if not has_spec(symbol):
            base["reason_codes"] = ["UNSUPPORTED_SYMBOL"]
            base["notes"] = (
                f"{symbol}: no verified MCX contract specification in this service; "
                "spreads/signals are refused rather than guessed"
            )
            return base
        if frame is None:
            frame = load_frame()

        as_of = pd.Timestamp(as_of_date)
        if pd.isna(as_of):
            base["reason_codes"] = ["INVALID_DATE"]
            return base
        hist = frame[frame["trade_date"] <= as_of]
        n_days = int(hist["trade_date"].nunique())
        if hist.empty:
            base["reason_codes"] = ["DATE_NOT_IN_DATA"]
            base["notes"] = "as_of_date is not in stored data; nothing is fabricated"
            return base

        report: dict[str, int] = {}
        sf = self._pair_frame(parsed, hist, report)
        if sf is None or sf.empty:
            base["reason_codes"] = ["NO_PAIR_OBSERVATIONS"]
            base["notes"] = (
                "both legs lack valid closes on the same dates up to as_of "
                f"(rejections={report or '{}'})"
            )
            return base
        row = sf[sf["trade_date"].dt.normalize() == as_of]
        if row.empty:
            base["reason_codes"] = ["DATE_NOT_IN_DATA"]
            base["notes"] = (
                f"pair has {len(sf)} joint observations but none on {as_of_date}; "
                "using only rows <= as_of"
            )
            return base
        spread = float(row["spread"].iloc[0])
        base["spread"] = spread

        from .zscore import rolling_zscore
        from .signals import signal_from_z

        z_tbl = rolling_zscore(sf.set_index("trade_date")["spread"], self.cfg)
        zrow = z_tbl.loc[as_of]
        z = None if pd.isna(zrow["z"]) else float(zrow["z"])
        base["z_score"] = z

        ok, reasons = compute_daily_filters(
            frame, sf, pd.Timestamp(near), pd.Timestamp(far), symbol, self.cfg,
        )
        filters_ok = bool(ok.loc[as_of]) if as_of in ok.index else False
        base["reason_codes"] = []

        if z is None:
            base["decision"] = DECISION_NO_TRADE
            base["reason_codes"].append("INSUFFICIENT_HISTORY")
            base["notes"] = (
                f"rolling z needs >= {self.cfg.min_hist_days}d "
                f"(lookback {self.cfg.lookback_days}d); have {n_days} distinct "
                "session(s) — no z-score, edge or cost is invented"
            )
        elif not filters_ok:
            base["decision"] = DECISION_NO_TRADE
            reason = str(reasons.get(as_of, "filter failure"))
            base["reason_codes"].append("FILTER_BLOCKED")
            base["notes"] = f"daily eligibility gate blocked new entries on {as_of_date}: {reason}"
        else:
            signal = signal_from_z(z, "flat", self.cfg)
            rv = float(get_spec(symbol).rvalue_per_lot_per_quote_unit) * self.cfg.lots_per_leg
            if signal == "LONG SPREAD":
                base["decision"] = DECISION_SELL_NEAR_BUY_FAR
                mean = float(zrow["mean"])
                base["gross_edge"] = (mean - spread) * rv
            elif signal == "SHORT SPREAD":
                base["decision"] = DECISION_BUY_NEAR_SELL_FAR
                mean = float(zrow["mean"])
                base["gross_edge"] = (spread - mean) * rv
            else:
                base["decision"] = DECISION_NO_TRADE
            if base["gross_edge"] is not None:
                base["notes"] = (
                    "gross_edge is a MODEL figure: per-lot rupees if the spread "
                    "mean-reverts at exit (|z|*std reversion to rolling mean at "
                    "entry); not a forecast and not tradable P&L. Costs are not "
                    "verified, so estimated_cost/net_edge stay null."
                )
            else:
                base["notes"] = (
                    f"z={z:+.2f} inside entry band (+/-{self.cfg.z_entry:.2f}); "
                    "no reversion edge is claimed"
                )
        return base

    # --------------------------- run_backtest ---------------------------

    def run_backtest(
        self,
        pair_id: str,
        start_date: str,
        end_date: str,
        strategy_version: str,
        *,
        frame: pd.DataFrame | None = None,
    ) -> dict[str, Any]:
        parsed = _parse_pair_id(pair_id)
        out: dict[str, Any] = {
            "completed_trades": None,
            "gross_pnl": None,
            "estimated_costs": None,
            "net_pnl": None,
            "max_drawdown": None,
            "assumptions": [],
            "runnable": False,
        }
        if strategy_version not in STRATEGY_VERSIONS:
            out["assumptions"] = [
                f"strategy_version {strategy_version!r} unknown to the quant "
                f"service (supported: {sorted(STRATEGY_VERSIONS)})"
            ]
            return out
        if parsed is None:
            out["assumptions"] = ["pair_id does not match SYMBOL_nearYYYYMMDD_farYYYYMMDD"]
            return out
        symbol, near, far = parsed
        if not has_spec(symbol):
            out["assumptions"] = [
                f"{symbol}: no verified MCX contract specification; backtest refused"
            ]
            return out
        if frame is None:
            frame = load_frame()
        s = pd.Timestamp(start_date)
        e = pd.Timestamp(end_date)
        win = frame[
            (frame["trade_date"] >= s) & (frame["trade_date"] <= e)
        ]
        report: dict[str, int] = {}
        sf = self._pair_frame(parsed, win, report)
        if sf is None or sf.empty:
            out["assumptions"] = [
                f"no joint close observations for this pair in the requested period "
                f"(rejections={report})" if report else
                "no joint close observations for this pair in the requested period"
            ]
            return out
        n_obs = len(sf)
        if n_obs < MIN_SPREAD_OBSERVATIONS:
            out["assumptions"] = [
                f"{n_obs} spread observation(s) in period < {MIN_SPREAD_OBSERVATIONS} "
                "required for a valid backtest; metrics withheld, not fabricated"
            ]
            out["completed_trades"] = 0
            return out

        ok, reasons = compute_daily_filters(
            frame, sf, pd.Timestamp(near), pd.Timestamp(far), symbol, self.cfg,
        )
        res = run_backtest(
            sf, symbol, self.cfg, segment_name=strategy_version,
            filters_ok=ok, filter_reasons=reasons,
        )
        m = res.metrics
        costs_cfg = self.cfg.costs is not None
        out.update(
            runnable=True,
            completed_trades=len(res.trades),
            gross_pnl=None if m is None else m.gross_pnl_rupees,
            max_drawdown=None if m is None else m.max_drawdown_rupees,
            estimated_costs=None if m is None else m.total_cost_rupees,
            net_pnl=None if m is None else m.net_pnl_rupees,
            assumptions=[
                "exec_mode=next_close: fills at the next session's close; "
                "signal(t) uses only rows <= t (no look-ahead)",
                "calendar-spread 1:1 same-family pair; P&L in INR per strategy lot",
                *(["net metrics withheld: verified CostInput not supplied; gross only"]
                  if not costs_cfg else []),
            ],
        )
        return out


def get_quant_service() -> GoldlensQuantService:
    """Entry point the backend expects (quant_interface.load_quant_service)."""
    return GoldlensQuantService()
