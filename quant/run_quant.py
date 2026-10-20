"""CLI entrypoint: build spreads from repo bhavcopy files, run the strategy.

Usage:
    py -3.13 quant/run_quant.py

The orchestrator never mixes GOLD and GOLDM legs (verified different bar-size
products). Cross-symbol pairs are opt-in via StrategyConfig.allow_cross_symbol
and are further enfored by tenor-offset matching. Output goes to stdout as
structured JSON, plus a human-readable header.
"""
from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

# allow direct execution as a script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from quant.config import StrategyConfig
from quant.contracts import cross_check_spec, get_spec
from quant.data import find_bhavcopy_files, load_bhavcopy
from quant.engine import compare_walk_forward, run_backtest, split_train_test, walk_forward
from quant.selection import eligible_contracts
from quant.spreads import pair_spreads, select_pair

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_GLOBS = ["BhavCopyDateWise_*.csv"]


def default_config() -> StrategyConfig:
    return StrategyConfig(
        lookback_days=30,
        min_hist_days=15,
        z_entry=1.5,
        z_exit=0.5,
        stop_z=3.5,
        max_holding_days=10,
        allow_cross_symbol=False,
        costs=None,
    )


def collect_source_files() -> list[Path]:
    return find_bhavcopy_files(REPO_ROOT)


def verified_value_per_lot_report(frame: pd.DataFrame) -> dict[str, dict[str, float]]:
    """Cross-check every configured contract spec against verified aggregates
    (YearWise stats shipped in the repo)."""
    yearwise = REPO_ROOT / "YearWise 2026-10-18 Detail report (1).xls"
    report: dict[str, dict[str, float]] = {}
    if not yearwise.exists():
        return report
    import re

    html = yearwise.read_text(encoding="utf-8", errors="replace")
    rows = re.findall(r"<tr>(.*?)</tr>", html, flags=re.S)
    for r in rows:
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", r)]
        if len(cells) < 7 or cells[0] != "FUTCOM" or cells[3] not in ("GOLD", "GOLDM"):
            continue
        lots = float(cells[4])
        value_lakhs = float(cells[5])
        if lots <= 0:
            continue
        symbol = cells[3]
        report[symbol] = {"lots": lots, "value_lakhs": value_lakhs, "value_lakh_per_lot": value_lakhs / lots}
    return report


def cross_check_specs(frame: pd.DataFrame) -> list[str]:
    agg = verified_value_per_lot_report(frame)
    out: list[str] = []
    for symbol, stats in agg.items():
        if not frame[frame["symbol"] == symbol].empty:
            close = frame[frame["symbol"] == symbol]["close"].median()
            ok, msg = cross_check_spec(symbol, float(close), stats["value_lakh_per_lot"])
            out.append(("PASS " if ok else "FAIL ") + msg)
    return out


def latest_pair_by_symbol(frame: pd.DataFrame, symbol: str, cfg: StrategyConfig):
    dates = sorted(frame["trade_date"].unique())
    if not dates:
        return None
    day = frame[frame["trade_date"] == dates[-1]]
    elig = eligible_contracts(frame, pd.Timestamp(dates[-1]), cfg.liquidity)
    pick = select_pair(elig)
    if pick is None:
        return None
    (near, far), picked_symbol = pick
    if picked_symbol != symbol:
        return None
    return near, far


def build_all_spreads(frame: pd.DataFrame, cfg: StrategyConfig):
    """Build the canonical spread series per trading symbol family.
    Uses the eligible pair observed at the LATEST date (front liquid pair)."""
    out: dict[str, dict[str, object]] = {}
    for symbol in ("GOLD", "GOLDM"):
        pick = latest_pair_by_symbol(frame, symbol, cfg)
        if pick is None:
            continue
        near, far = pick
        report: dict[str, int] = {}
        sf = pair_spreads(frame, symbol, near, far, report=report)
        out[symbol] = {
            "near_expiry": near,
            "far_expiry": far,
            "spread_frame": sf,
            "rejection_report": report,
        }
    return out


def compute_daily_filters(
    frame: pd.DataFrame,
    sf: pd.DataFrame,
    near: pd.Timestamp,
    far: pd.Timestamp,
    symbol: str,
    cfg: StrategyConfig,
) -> tuple[pd.Series, pd.Series]:
    """Per-spread-day gate: BOTH legs must pass eligibility (volume, OI,
    value, expiry headroom, price sanity, verified metadata) and neither leg
    may be a stale zero-volume settlement mark."""
    idx = pd.DatetimeIndex(sf["trade_date"])
    ok = pd.Series(False, index=idx)
    reasons = pd.Series("unfiltered", index=idx)
    for d in idx:
        elig = eligible_contracts(frame, d, cfg.liquidity)
        leg_ok = {}
        leg_reason = {}
        for label, expiry in (("near", near), ("far", far)):
            row = elig[(elig["symbol"] == symbol) & (elig["expiry_ts"] == expiry)]
            if row.empty:
                leg_ok[label] = False
                leg_reason[label] = f"{label}_missing"
                continue
            r0 = row.iloc[0]
            stale = bool(r0.get("stale", False))
            if stale:
                leg_ok[label] = False
                leg_reason[label] = f"{label}_stale_no_volume"
            else:
                leg_ok[label] = bool(r0["eligible"])
                leg_reason[label] = "" if r0["eligible"] else f"{label}:{r0['reason']}"
        ok.loc[d] = leg_ok["near"] and leg_ok["far"]
        reasons.loc[d] = "|".join(v for v in (leg_reason["near"], leg_reason["far"]) if v) or ""
    return ok, reasons


def run() -> dict[str, object]:
    cfg = default_config()
    cfg.validate()
    files = collect_source_files()
    if not files:
        return {"error": "no bhavcopy files matching " + ", ".join(DATA_GLOBS)}

    frame = load_bhavcopy(files)
    unique_files = len(set(frame["source_file"]))
    dedup_note = (
        f"{len(files)} file(s) globbed, {unique_files} distinct source(s) represented; "
        "duplicate (trade_date, symbol, expiry) keys resolved conflict-aware "
        "(priced records preferred over blank marks; see docs/DATA_QUALITY_REPORT.md)"
    )
    spec_checks = cross_check_specs(frame)

    spreads = build_all_spreads(frame, cfg)
    if not spreads:
        return {"error": "no eligible same-family pairs available", "spec_checks": spec_checks}

    results: dict[str, object] = {}
    explanations_sample: list[dict[str, object]] = []

    for symbol, info in spreads.items():
        sf: pd.DataFrame = info["spread_frame"]
        near, far = info["near_expiry"], info["far_expiry"]
        filters_ok, filter_reasons = compute_daily_filters(frame, sf, near, far, symbol, cfg)
        full = run_backtest(
            sf, symbol, cfg, segment_name="full", filters_ok=filters_ok, filter_reasons=filter_reasons
        )
        train, test, split_note = split_train_test(sf, cfg)
        train_res = run_backtest(train, symbol, cfg, segment_name="train") if len(train) >= 3 else None
        test_res = run_backtest(test, symbol, cfg, segment_name="test") if len(test) >= 3 else None
        insufficient = len(sf) < 3
        wf_folds = [] if insufficient else walk_forward(sf, symbol, cfg, n_folds=cfg.walk_forward_folds)
        if insufficient:
            explanations_sample = full.explanations[: min(5, len(full.explanations))]

        results[symbol] = {
            "near_expiry": str(near.date()),
            "far_expiry": str(far.date()),
            "spread_observations": int(len(sf)),
            "first_date": str(sf["trade_date"].min().date()) if len(sf) else None,
            "last_date": str(sf["trade_date"].max().date()) if len(sf) else None,
            "spread_rejections": info.get("rejection_report", {}),
            "filter_failures": int((~filters_ok).sum()),
            "full_summary": full.summary(),
            "train_summary": train_res.summary() if train_res else {"skipped": split_note},
            "test_summary": test_res.summary() if test_res else {"skipped": split_note},
            "walk_forward": {
                "folds": wf_folds,
                "comparison": compare_walk_forward(wf_folds) if wf_folds else None,
                "skipped_reason": None if wf_folds else "insufficient history for folds",
            },
            "insufficient_history": insufficient,
            "recent_explanations": full.explanations[-10:],
        }
        if insufficient:
            results[symbol]["verdict"] = (
                "NOT A VALID BACKTEST: too few observations. Signal layer outputs "
                "NO TRADE with 'insufficient history' rationale for all days."
            )

    return {
        "data_files": [str(f.name) for f in files],
        "loading_note": dedup_note,
        "trading_days_loaded": int(frame["trade_date"].nunique()),
        "date_range": [
            str(frame["trade_date"].min().date()),
            str(frame["trade_date"].max().date()),
        ],
        "spec_checks": spec_checks,
        "config": {
            "lookback_days": cfg.lookback_days,
            "z_entry": cfg.z_entry,
            "z_exit": cfg.z_exit,
            "stop_z": cfg.stop_z,
            "max_holding_days": cfg.max_holding_days,
            "min_hist_days": cfg.min_hist_days,
            "exec_mode": cfg.exec_mode,
            "allow_overlap": cfg.allow_overlap,
            "lots_per_leg": cfg.lots_per_leg,
            "walk_forward_folds": cfg.walk_forward_folds,
            "costs": "not configured (gross-only reporting)" if cfg.costs is None else "configured",
        },
        "results": results,
        "signal_explanations_sample": explanations_sample,
    }


if __name__ == "__main__":
    report = run()
    payload = json.dumps(report, indent=2, default=str)
    (REPO_ROOT / "quant_report.json").write_text(payload, encoding="utf-8")
    print(payload)
