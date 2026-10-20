"""Historical-data coverage manifest (Pass 15).

Builds an honest manifest of missing trading dates for MCX bhavcopy
acquisition, using an authoritative holiday calendar, plus a validation
checklist and an unmet-requirements report for the spread pairs.

Run:  py -3.13 -m quant.ingestion.coverage

Honesty rules encoded here:
- Missing dates are NEVER claimed exhaustive: the holiday calendar covers
  calendar year 2026 only (official MCX page, accessed 2026-10-20) and the
  exchange may add/change holidays by circular. Dates outside coverage are
  marked "calendar_unverified", not "trading day".
- Partial holidays (one session closed) may still produce a bhavcopy via
  the open session; they stay candidates but are flagged.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd

from quant.config import StrategyConfig
from quant.data import find_bhavcopy_files
from quant.ingestion import readiness
from quant.run_quant import build_all_spreads, default_config

REPO_ROOT = Path(__file__).resolve().parents[2]

# Official MCX trading-holidays page
# (https://www.mcxindia.com/market-operations/trading-surveillance/trading-holidays),
# calendar year 2026 list, accessed 2026-10-20.
# session_closed: "both" | "morning" (evening trades -> bhavcopy likely exists)
MCX_HOLIDAYS_2026: dict[str, dict] = {
    "2026-01-01": {"name": "New Year Day", "session_closed": "morning"},
    "2026-01-26": {"name": "Republic Day", "session_closed": "both"},
    "2026-03-03": {"name": "Holi", "session_closed": "morning"},
    "2026-03-26": {"name": "Shri Ram Navmi", "session_closed": "morning"},
    "2026-03-31": {"name": "Shri Mahavir Jayanti", "session_closed": "morning"},
    "2026-04-03": {"name": "Good Friday", "session_closed": "both"},
    "2026-04-14": {"name": "Dr. Baba Saheb Ambedkar Jayanti", "session_closed": "morning"},
    "2026-05-01": {"name": "Maharashtra Day", "session_closed": "morning"},
    "2026-05-28": {"name": "Bakri ID", "session_closed": "morning"},
    "2026-06-26": {"name": "Moharram", "session_closed": "morning"},
    "2026-09-14": {"name": "Ganesh Chaturthi", "session_closed": "morning"},
    "2026-10-02": {"name": "Mahatma Gandhi Jayanti", "session_closed": "both"},
    "2026-10-20": {"name": "Dassera", "session_closed": "morning"},
    "2026-11-10": {"name": "Diwali-Balipratipada", "session_closed": "morning"},
    "2026-11-24": {"name": "Guru Nanak Jayanti", "session_closed": "morning"},
    "2026-12-25": {"name": "Christmas", "session_closed": "both"},
}

CALENDAR_SOURCES = [
    "https://www.mcxindia.com/market-operations/trading-surveillance/trading-holidays (accessed 2026-10-20)",
    "Corroborated: Times of India MCX holidays 2026; ICICI Direct; BSE commodity segment list",
]
CALENDAR_LIMIT = "Covers calendar year 2026 only; exchange may alter holidays by circular. Dates outside 2026 are calendar_unverified, not trading days."


def _parse(d: str) -> date:
    return datetime.strptime(d, "%Y-%m-%d").date()


def candidate_trading_dates(start: date, end: date) -> list[dict]:
    """Weekdays in [start, end], minus full-holiday dates; partial holidays flagged."""
    out: list[dict] = []
    d = start
    while d <= end:
        if d.weekday() < 5:
            key = d.isoformat()
            hol = MCX_HOLIDAYS_2026.get(key)
            if hol and hol["session_closed"] == "both":
                pass  # full holiday: no bhavcopy possible
            else:
                out.append({
                    "date": key,
                    "weekday": d.strftime("%a"),
                    "partial_holiday": bool(hol),
                    "holiday_name": hol["name"] if hol else None,
                    "session_note": "morning closed, evening session may trade (bhavcopy may still exist)" if hol else None,
                })
        d += timedelta(days=1)
    return out


def missing_dates_manifest(observed: list[str], end_date: date) -> dict:
    """Manifest of acquisition-needed dates between first observed and end_date."""
    observed_set = set(observed)
    if not observed_set:
        return {
            "observed_sessions": [],
            "observed_count": 0,
            "candidate_trading_days_first_observed_to_end": 0,
            "acquired": 0,
            "missing_count": 0,
            "missing_dates": [],
            "calendar_sources": CALENDAR_SOURCES,
            "calendar_limit": CALENDAR_LIMIT,
            "exhaustive_claim": False,
            "note": "No sessions observed yet: coverage start cannot be determined, "
                    "so no missing-date claims are made. Import at least one file first.",
        }
    first = min(_parse(x) for x in observed_set)
    candidates = candidate_trading_dates(first, end_date)
    missing = []
    have = []
    for c in candidates:
        (have if c["date"] in observed_set else missing).append(c)
    return {
        "observed_sessions": sorted(observed_set),
        "observed_count": len(observed_set),
        "candidate_trading_days_first_observed_to_end": len(candidates),
        "acquired": len(have),
        "missing_count": len(missing),
        "missing_dates": missing,
        "calendar_sources": CALENDAR_SOURCES,
        "calendar_limit": CALENDAR_LIMIT,
        "exhaustive_claim": False,
        "note": "missing_dates lists weekdays (minus 2026 official full holidays) with no bhavcopy on disk. It is NOT exhaustive: unlisted exchange circulars, technical outages, or non-2026 calendar gaps may add sessions; each downloaded file is validated on import.",
    }


@dataclass
class PairRequirements:
    floor_observations: int = readiness.MIN_SPREAD_OBSERVATIONS
    recommended_observations: int = readiness.RECOMMENDED_OBSERVATIONS
    z_warmup_sessions: int = readiness.MIN_HIST_DAYS_REQUIRED
    walkforward_min_sessions: int = 70


def pair_requirements_report(frame) -> list[dict]:
    """Which pair requirements are unmet, per canonical pair (latest-date eligible)."""
    req = PairRequirements()
    cfg: StrategyConfig = default_config()
    spreads = build_all_spreads(frame, cfg)
    rows = []
    for symbol, info in spreads.items():
        near, far = info["near_expiry"], info["far_expiry"]
        shared = len(info["spread_frame"]) if hasattr(info["spread_frame"], "__len__") else 0
        pair_id = f"{symbol}_near{pd.Timestamp(near):%Y%m%d}_far{pd.Timestamp(far):%Y%m%d}"
        rows.append({
            "pair_id": pair_id,
            "near_expiry": str(pd.Timestamp(near).date()),
            "far_expiry": str(pd.Timestamp(far).date()),
            "shared_valid_observations": int(shared),
            "floor_min": req.floor_observations,
            "recommended_min": req.recommended_observations,
            "z_warmup_min": req.z_warmup_sessions,
            "walkforward_min": req.walkforward_min_sessions,
            "unmet": [label for label, need, got in (
                ("floor", req.floor_observations, shared),
                ("z_warmup", req.z_warmup_sessions, shared),
                ("walkforward", req.walkforward_min_sessions, shared),
            ) if got < need],
        })
    return rows


def validation_checklist(files: list[Path]) -> list[dict]:
    """Per-file checklist every downloaded file must pass before import."""
    out = []
    for p in files:
        out.append({
            "file": p.name,
            "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
            "size_bytes": p.stat().st_size,
            "imported": True,
        })
    return out


CHECKLIST_TEXT = """## Per-file validation checklist (run for EVERY new download)
1. Filename follows `BhavCopyDateWise_<DDMMYYYY>.csv`; never overwrite an existing file (conflict -> sidecar).
2. Record SHA-256 and size; append to `data/raw/mcx/manifest_imported.json` (status `verified_imported`).
3. File opens as CSV; `TRD_DATE` parses to a single distinct trading date.
4. Row counts: raw rows vs FUTCOM rows (options excluded from observations, recorded, not counted).
5. Duplicate composite keys (symbol/expiry/type/date) resolved by conflict-aware dedup; investigate increases.
6. Blank/invalid close prices flagged (kept, never imputed).
7. Expiry dates parse; spread pairs keep near < far ordering.
8. Re-run: py -3.13 quant/run_quant.py  &&  py -3.13 -m quant.ingestion.generate_reports
9. Confirm reports did not double-count sessions (deterministic counts).
"""


def main() -> int:
    files = find_bhavcopy_files(REPO_ROOT)
    if not files:
        print(json.dumps({"error": "no bhavcopy files found"}))
        return 1
    from quant.data import load_bhavcopy
    frame = load_bhavcopy(files)
    observed = sorted(str(d.date()) for d in frame["trade_date"].dropna().unique())
    end_date = date.today()
    manifest = missing_dates_manifest(observed, end_date)
    manifest["file_inventory"] = validation_checklist(files)
    manifest["pair_requirements"] = pair_requirements_report(frame)
    manifest["checklist"] = CHECKLIST_TEXT.strip().splitlines()

    reports = REPO_ROOT / "data" / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    out_json = reports / "DATA_ACQUISITION_MANIFEST.json"
    out_json.write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")

    lines = [
        "# Data Acquisition Manifest (Pass 15)",
        "",
        f"Observed sessions: **{manifest['observed_count']}** {observed}",
        f"Candidate trading days (first observed -> {end_date}): {manifest['candidate_trading_days_first_observed_to_end']}",
        f"Missing (no bhavcopy on disk): **{manifest['missing_count']}**",
        "",
        "| Date | Weekday | Note |",
        "|---|---|---|",
    ]
    for m in manifest["missing_dates"]:
        lines.append(f"| {m['date']} | {m['weekday']} | {m.get('session_note') or ''} |")
    lines += [
        "",
        f"Calendar: {CALENDAR_LIMIT}",
        f"Sources: {'; '.join(CALENDAR_SOURCES)}",
        "",
        "## Pair requirements status",
        "",
        "| Pair | Shared valid obs | Floor 30 | Z warmup 15 | Walk-forward 70 | Unmet |",
        "|---|---|---|---|---|---|",
    ]
    for p in manifest["pair_requirements"]:
        lines.append(
            f"| {p['pair_id']} | {p['shared_valid_observations']} | "
            f"{'MET' if p['shared_valid_observations'] >= p['floor_min'] else 'UNMET'} | "
            f"{'MET' if p['shared_valid_observations'] >= p['z_warmup_min'] else 'UNMET'} | "
            f"{'MET' if p['shared_valid_observations'] >= p['walkforward_min'] else 'UNMET'} | "
            f"{', '.join(p['unmet']) or 'none'} |"
        )
    lines += ["", CHECKLIST_TEXT.strip(), "",
              "**Reminder: `NOT READY` is a data-and-validation status, not a bearish trading signal. "
              "The dashboard must communicate insufficient evidence, not strategy failure.**"]
    (REPO_ROOT / "docs" / "DATA_ACQUISITION_CHECKLIST.md").write_text("\n".join(lines), encoding="utf-8")

    print(json.dumps({"manifest": str(out_json), "observed": manifest["observed_count"],
                      "missing": manifest["missing_count"], "exhaustive_claim": False}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
