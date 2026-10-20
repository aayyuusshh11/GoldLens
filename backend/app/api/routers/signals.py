"""POST /api/signals/analyze."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api import deps
from app.services.analytics import SignalAnalyzeResult, analyze_signal
from app.schemas.api_models import (
    SignalAnalyzeRequest,
    SignalAnalyzeResponse,
)

router = APIRouter(prefix="/api")


@router.post("/signals/analyze", response_model=SignalAnalyzeResponse)
def signals_analyze(request: SignalAnalyzeRequest) -> SignalAnalyzeResponse:
    """Structured analysis; NO_TRADE + nulls when history/specs are insufficient."""
    db = deps.get_db()
    result = _analyze(db, request)
    return result


def _analyze(db, request: SignalAnalyzeRequest) -> SignalAnalyzeResponse:
    from app.services.analytics import parse_pair_id

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
    result: SignalAnalyzeResult = analyze_signal(db, request.pair_id, request.as_of_date)
    return SignalAnalyzeResponse(
        pair_id=result.pair_id,
        as_of_date=result.as_of_date,
        decision=result.decision,
        reason_codes=result.reason_codes,
        spread=result.spread,
        z_score=result.z_score or None,
        gross_edge=result.gross_edge or None,
        estimated_cost=result.estimated_cost or None,
        net_edge=result.net_edge or None,
        data_quality=result.data_quality,
        notes=result.notes,
    )
