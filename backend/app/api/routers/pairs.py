"""GET /api/pairs and GET /api/pairs/{pair_id}/history."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api import deps
from app.services.analytics import list_pairs, pair_history
from app.schemas.api_models import PairHistoryResponse, PairsResponse

router = APIRouter(prefix="/api")


@router.get("/pairs", response_model=PairsResponse)
def pairs(symbol: str | None = None) -> PairsResponse:
    """Candidate near/far pairs (structural only; eligibility is quant-owned)."""
    return list_pairs(deps.get_db(), symbol=symbol)


@router.get("/pairs/{pair_id}/history", response_model=PairHistoryResponse)
def pair_history_endpoint(pair_id: str) -> PairHistoryResponse:
    """Reference spread observations; explicitly NOT claimed as history."""
    history = pair_history(deps.get_db(), pair_id)
    if history is None:  # invalid pair_id format
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "not_found",
                    "message": "unknown pair_id format",
                    "details": {"pair_id": pair_id},
                }
            },
        )
    return history
