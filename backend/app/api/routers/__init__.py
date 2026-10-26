"""Routers for the GoldLens data API."""
from app.api.routers.backtests import router as backtests_router
from app.api.routers.contracts import router as contracts_router
from app.api.routers.data_quality import router as data_quality_router
from app.api.routers.health import router as health_router
from app.api.routers.ingest import router as ingest_router
from app.api.routers.pairs import router as pairs_router
from app.api.routers.signals import router as signals_router

__all__ = [
    "backtests_router",
    "contracts_router",
    "data_quality_router",
    "health_router",
    "ingest_router",
    "pairs_router",
    "signals_router",
]
