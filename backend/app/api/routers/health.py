"""GET /api/health."""
from __future__ import annotations

from fastapi import APIRouter

from app.api import deps
from app.config import API_VERSION
from app.schemas.api_models import HealthResponse

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    db = deps.get_db()
    dates = db.distinct_trade_dates()
    return HealthResponse(
        status="healthy",
        service="goldlens-backend",
        version=API_VERSION,
        data_available=db.observation_count() > 0,
        distinct_trade_dates=len(dates),
        latest_data_date=dates[-1] if dates else None,
    )
