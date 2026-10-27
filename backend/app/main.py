"""GoldLens data API — FastAPI application (docs/API_CONTRACT.md)."""
from __future__ import annotations

import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.api.routers import (
    backtests_router,
    contracts_router,
    data_quality_router,
    health_router,
    ingest_router,
    pairs_router,
    signals_router,
)
from app.config import API_TITLE, API_VERSION
from app.services.quant_interface import warm_quant_service


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup/teardown. Prewarms the quant service (GOLDLENS_QUANT_PACKAGE
    set) in a daemon thread so the initial dataset load/validation never
    lands in a request path — the first signal/backtest call is fast."""
    threading.Thread(target=warm_quant_service, name="quant-warmup", daemon=True).start()
    yield


app = FastAPI(title=API_TITLE, version=API_VERSION, lifespan=lifespan)

for _router in (
    health_router,
    contracts_router,
    pairs_router,
    signals_router,
    backtests_router,
    data_quality_router,
    ingest_router,
):
    app.include_router(_router)


@app.exception_handler(HTTPException)
async def http_error_shape(_request: Request, exc: HTTPException) -> JSONResponse:
    """Contract error shape: {"error": {"code", "message", "details"}}."""
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        payload = exc.detail
        status = exc.status_code
    else:
        code = "not_found" if exc.status_code == 404 else "invalid_input"
        payload = {"error": {"code": code, "message": str(exc.detail), "details": {}}}
        status = exc.status_code
    return JSONResponse(status_code=status, content=payload)
