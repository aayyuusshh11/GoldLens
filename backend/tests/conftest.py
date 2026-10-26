"""pytest configuration: expose backend/app as the `app` package + CSV fixtures."""
from __future__ import annotations

import csv
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

HEADER = [
    "Date",
    "Instrument Name",
    "Symbol",
    "Expiry Date",
    "Option Type",
    "Strike Price",
    "Open",
    "High",
    "Low",
    "Close",
    "Previous Close",
    "Volume(Lots)",
    "Volume(In 000's)",
    "Value(Lacs)",
    "Open Interest(Lots)",
]

# Header-name aliases that are valid Python kwargs (spaces/underscores mapped).
HEADER_ALIASES = {
    "Date": "Date",
    "Instrument": "Instrument Name",
    "Symbol": "Symbol",
    "Expiry": "Expiry Date",
    "Option": "Option Type",
    "Strike": "Strike Price",
    "Open": "Open",
    "High": "High",
    "Low": "Low",
    "Close": "Close",
    "PreviousClose": "Previous Close",
    "Volume": "Volume(Lots)",
    "Volume000s": "Volume(In 000's)",
    "Value": "Value(Lacs)",
    "OI": "Open Interest(Lots)",
}


def make_row(**overrides: str) -> list[str]:
    """A fully populated FUTCOM GOLD row (trailing-space symbol, as in source).

    Overrides use the aliases in HEADER_ALIASES (e.g. make_row(Volume="0")).
    Passing a header key not in HEADER_ALIASES is a test-authoring error.
    """
    row = {
        "Date": "16 Oct 2026",
        "Instrument Name": "FUTCOM",
        "Symbol": "GOLD         ",
        "Expiry Date": "04DEC2026",
        "Option Type": "-",
        "Strike Price": "0",
        "Open": "147000",
        "High": "148200",
        "Low": "146500",
        "Close": "147918",
        "Previous Close": "146900",
        "Volume(Lots)": "5091",
        "Volume(In 000's)": "5091.000 GRMS ",
        "Value(Lacs)": "754783.67",
        "Open Interest(Lots)": "16717",
    }
    for key, value in overrides.items():
        if key not in HEADER_ALIASES:
            raise KeyError(
                f"unknown override {key!r}; valid: {sorted(HEADER_ALIASES)}"
            )
        row[HEADER_ALIASES[key]] = value
    return [row[c] for c in HEADER]


def write_csv(
    tmp_path: Path,
    rows: list[list[str]],
    header: list[str] | None = None,
    name: str = "sample.csv",
) -> Path:
    """Write a small synthetic bhavcopy file."""
    target = tmp_path / name
    with target.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header if header is not None else HEADER)
        writer.writerows(rows)
    return target
