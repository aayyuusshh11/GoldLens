"""GET /api/contracts â€” contract registry listings."""
from __future__ import annotations

from fastapi import APIRouter

from app.api import deps
from app.schemas.api_models import ContractOut, ContractsResponse

router = APIRouter(prefix="/api")


@router.get("/contracts", response_model=ContractsResponse)
def contracts(
    symbol: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> ContractsResponse:
    """Registry records; unknown specification fields stay null until verified."""
    limit = max(1, min(limit, 1000))
    offset = max(0, offset)
    db = deps.get_db()
    total = db.contract_total()
    rows = db.list_contracts(symbol=symbol, limit=limit, offset=offset)
    return ContractsResponse(
        total=total,
        count=len(rows),
        offset=offset,
        contracts=[ContractOut(**r) for r in rows],
    )
