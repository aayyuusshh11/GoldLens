"""GET /api/data-quality â€” real stored-data quality report (Phase 4)."""
from __future__ import annotations

from fastapi import APIRouter

from app.api import deps
from app.schemas.data_quality import DataQualityReport
from app.services.data_quality import build_data_quality
from app.storage.database import GoldlensDB

router = APIRouter(prefix="/api")


@router.get("/data-quality", response_model=DataQualityReport)
def data_quality() -> DataQualityReport:
    """Current data-quality state across ingested sources."""
    db: GoldlensDB = deps.get_db()
    return build_data_quality(db)
