"""Shared FastAPI dependencies."""
from __future__ import annotations

from functools import lru_cache

from app.config import DB_PATH
from app.storage.database import GoldlensDB


@lru_cache(maxsize=1)
def get_db() -> GoldlensDB:
    """Request-independent DuckDB handle (single process, cheap stats queries)."""
    return GoldlensDB(DB_PATH)
