"""Local configuration for the GoldLens data backend.

Plain constants + environment overrides; no external settings dependency.
"""
from __future__ import annotations

import os
from pathlib import Path

# backend/app/config.py -> backend/app -> backend -> project root
PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_DIR = Path(os.environ.get("GOLDLENS_DATA_DIR", PROJECT_ROOT / "data"))
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"

DB_FILENAME = os.environ.get("GOLDLENS_DB_FILENAME", "goldlens.duckdb")
DB_PATH = PROCESSED_DIR / DB_FILENAME

DEFAULT_CSV_NAME = "BhavCopyDateWise_16102026 (2).csv"
_SEARCHED_CSV_PATHS = (
    PROJECT_ROOT / DEFAULT_CSV_NAME,
    RAW_DIR / DEFAULT_CSV_NAME,
)

DEFAULT_CSV_PATH: Path
"""Default bhavcopy CSV; override with GOLDLENS_CSV_PATH."""
_env_csv = os.environ.get("GOLDLENS_CSV_PATH")
if _env_csv:
    DEFAULT_CSV_PATH = Path(_env_csv)
else:
    for _c in _SEARCHED_CSV_PATHS:
        if _c.exists():
            DEFAULT_CSV_PATH = _c
            break
    else:
        DEFAULT_CSV_PATH = _SEARCHED_CSV_PATHS[0]

API_TITLE = "GoldLens Data API"
API_VERSION = "0.1.0"

# Minimum distinct trading dates required before analytics are considered; the
# quant owner owns the final rule (see docs/API_CONTRACT.md section 10). One
# date == never sufficient.
MIN_TRADE_DATES_FOR_SIGNAL = 30
MIN_TRADE_DATES_FOR_BACKTEST = 30
