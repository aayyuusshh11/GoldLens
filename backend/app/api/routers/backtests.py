"""POST /api/backtests/run."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api import deps
from app.services.analytics import parse_pair_id, run_backtest
from app.schemas.api_models import BacktestRunRequest, BacktestRunResponse

router = APIRouter(prefix="/api")


@router.post("/backtests/run", response_model=BacktestRunResponse)
def backtests_run(request: BacktestRunRequest) -> BacktestRunResponse:
    """Refuses (runnable=false, null metrics) without enough real history."""
    if parse_pair_id(request.pair_id) is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "not_found",
                    "message": "unknown pair_id format",
                    "details": {"pair_id": request.pair_id},
                }
            },
        )
    db = deps.get_db()
    return run_backtest(
        db,
        request.pair_id,
        request.start_date,
        request.end_date,
        request.strategy_version,
    )
