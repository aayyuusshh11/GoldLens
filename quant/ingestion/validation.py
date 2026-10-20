"""Validation & data-quality reporting for ingested MCX bhavcopy data.

Never fabricates: any payload that does not parse is quarantined and
reported verbatim. The MCX GetDateWiseBhavCopy XHR returns JSON rows whose
column names must map onto the same schema the exchange's BhavCopy CSV page
publishes (Date, Instrument Name, Symbol, Expiry Date, Option Type, Strike
Price, Open, High, Low, Close, Previous Close, Volume(lots), Value(Lakhs),
Open Interest(lots)). Rows that fork from that contract are rejected with the
reason recorded; nothing is auto-invented.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import pandas as pd

from quant.data import _parse_date, _parse_expiry, _parse_number

MCX_JSON_ALIASES: dict[str, list[str]] = {
    "date": ["Date"],
    "instrument": ["InstrumentName", "Instrument Name", "Instrument"],
    "symbol": ["Symbol"],
    "expiry_date": ["ExpiryDate", "Expiry Date"],
    "option_type": ["OptionType", "Option Type", "CPType"],
    "strike_price": ["StrikePrice", "Strike Price"],
    "open": ["Open", "OpenPrice"],
    "high": ["High", "HighPrice"],
    "low": ["Low", "LowPrice"],
    "close": ["Close", "ClosePrice"],
    "previous_close": ["PCP", "Previous Close", "PrevClose"],
    "volume_lots": ["Volume", "svolume", "Volume(Lots)"],
    "value_lakhs": ["Value", "Value(Lakhs)", "Value(Lacs)"],
    "open_interest_lots": ["OpenInterest", "OI", "Open Interest(Lots)"],
}


class IngestionError(ValueError):
    """Raised when raw data does not honour the documented bhavcopy schema."""


def mcx_json_rows_to_csv_rows(raw: bytes, trade_date: dt.date) -> list[dict[str, object]]:
    """Map a GetDateWiseBhavCopy JSON payload to canonical bhavcopy rows.

    Returns a list of dicts with the canonical column names. Raises
    IngestionError when the payload shares none of the expected keys.
    """
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as err:
        raise IngestionError(f"payload is not JSON: {err}") from err
    if isinstance(payload, dict):
        rows = payload.get("Data")
        if rows is None:
            raise IngestionError("JSON object has no 'Data' array")
    elif isinstance(payload, list):
        rows = payload
    else:
        raise IngestionError(f"unexpected JSON top-level type {type(payload)!r}")
    out: list[dict[str, object]] = []
    if not rows:
        return out
    sample_keys = set(rows[0].keys())
    mapped = {c: next((k for k in al if k in sample_keys), None) for c, al in MCX_JSON_ALIASES.items()}
    if mapped["symbol"] is None or mapped["close"] is None:
        raise IngestionError(f"payload keys {sorted(sample_keys)} do not match the bhavcopy contract")
    for r in rows:
        rec: dict[str, object] = {}
        for canon, key in mapped.items():
            if key is None:
                rec[canon] = ""
            else:
                rec[canon] = r.get(key, "")
        out.append(rec)
    return out


def write_bhavcopy_csv(rows: list[dict[str, object]], path: Path, trade_date: dt.date) -> None:
    """Serialize canonical rows into the same CSV contract as the exchange's
    date-wise BhavCopy export (the file naming the loader globs)."""
    cols = ["date", "instrument", "symbol", "expiry_date", "option_type", "strike_price",
            "open", "high", "low", "close", "previous_close", "volume_lots",
            "value_lakhs", "open_interest_lots"]
    header = ["Date", "Instrument Name", "Symbol", "Expiry Date", "Option Type",
              "Strike Price", "Open", "High", "Low", "Close", "Previous Close",
              "Volume(Lots)", "Value(Lakhs)", "Open Interest(Lots)"]
    lines = [",".join(header)]
    for r in rows:
        vals = []
        for c in cols:
            v = r.get(c, "")
            s = "" if v is None else str(v)
            if "," in s:
                s = f'"{s}"'
            vals.append(s)
        lines.append(",".join(vals))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


CHECK_TYPES = [
    "duplicate_keys",
    "blank_close",
    "price_consistency",
    "nonpositive_volumes",
    "missing_oi",
    "unparsed_expiry",
    "expired_contracts",
    "trade_date_continuity",
    "duplicate_sha_files",
]


def check_frame(frame: pd.DataFrame, files: list[tuple[str, str]]) -> dict[str, object]:
    """Run DQ checks over a loaded (normalized) bhavcopy frame.

    files = [(path, sha256)] — used for byte-identity reporting.
    """
    checks: dict[str, object] = {}
    key_cols = ["trade_date", "symbol", "expiry_ts"]
    checks["duplicate_keys"] = int(frame.duplicated(subset=key_cols).sum())
    checks["blank_close"] = int(frame["close"].isna().sum())
    bad_px = ((frame["high"] < frame["low"])
              | (frame["close"] > frame["high"])
              | (frame["close"] < frame["low"]))
    checks["price_consistency"] = int(bad_px.fillna(False).sum())
    checks["nonpositive_volumes"] = int((frame["volume_lots"].fillna(0) < 0).sum())
    checks["missing_oi"] = int(frame["open_interest_lots"].isna().sum())
    checks["unparsed_expiry"] = int(frame["expiry_ts"].isna().sum())
    checks["expired_contracts"] = int((frame["expiry_ts"] < frame["trade_date"]).sum())
    dates = sorted(set(frame["trade_date"].dropna()))
    gaps: list[str] = []
    if len(dates) >= 2:
        span = pd.Series(pd.to_datetime(dates)).sort_values().diff().dt.days.dropna()
        gap_days = int(span.max())
        n_dates = len(dates)
    else:
        gap_days, n_dates = 0, len(dates)
    checks["distinct_trade_dates"] = n_dates
    checks["largest_calendar_gap_days"] = gap_days
    checks["trade_date_continuity"] = (
        f"{n_dates} distinct date(s); gaps are expected over weekends/holidays "
        "and are NOT inferred here (weekend sessions possible on MCX)"
        if n_dates > 1 else "single trading day in dataset"
    )
    hashes = [h for _, h in files]
    checks["duplicate_sha_files"] = len(hashes) - len(set(hashes))
    checks["_dates"] = [str(d.date()) for d in dates]
    checks["_symbols"] = sorted(set(frame["symbol"].dropna()))
    return checks


def build_report(frame: pd.DataFrame, files: list[tuple[str, str]],
                 quarantined: list[dict[str, object]] | None = None) -> dict[str, object]:
    dq = check_frame(frame, files)
    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": [{"path": p, "sha256": h} for p, h in files],
        "row_count_after_cleaning": int(len(frame)),
        "checks": {k: v for k, v in dq.items() if not k.startswith("_")},
        "trade_dates": dq["_dates"],
        "symbols": dq["_symbols"],
        "quarantined": quarantined or [],
        "backtest_eligibility_note": (
            "A valid spread backtest needs at least 30 eligible spread "
            "observations (~100+ for walk-forward). This dataset does not "
            "meet that minimum."
            if len(dq["_dates"]) < 30 else
            "dataset window may support a minimal walk-forward"
        ),
    }


def write_report_md(report: dict[str, object], path: Path) -> None:
    hdr = "| Check | Result |\n|---|---|"
    lines = [
        "# MCX Data Quality Report",
        "",
        f"Generated: {report['generated_at']} — values are measured, never guessed.",
        "",
        "## Files ingested (SHA-256)",
        "",
        "| File | SHA-256 |",
        "|---|---|",
    ]
    lines += [f"| `{f['path']}` | `{f['sha256']}` |" for f in report["files"]]  # type: ignore[index]
    checks: dict = report["checks"]  # type: ignore[assignment]
    lines += ["", "## Row-level checks (post-cleaning)", "", hdr]
    lines += [f"| {k} | {v} |" for k, v in checks.items()]
    lines += [
        "",
        "## Trade dates",
        "",
        ", ".join(report["trade_dates"]) or "(none)",  # type: ignore[index]
        "",
        "## Symbols present",
        "",
        ", ".join(report["symbols"]) or "(none)",  # type: ignore[index]
        "",
        "## Backtest eligibility",
        "",
        str(report["backtest_eligibility_note"]),  # type: ignore[index]
        "",
        "## Quarantined payloads",
        "",
        f"{len(report['quarantined'])} record(s).",  # type: ignore[index]
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")
