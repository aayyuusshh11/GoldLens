"""POST /api/ingest â€” internal utility endpoint."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.api import deps
from app.config import DEFAULT_CSV_PATH
from app.schemas.api_models import IngestRequest, IngestResponse
from app.services.ingest import MissingColumnError, InvalidCsvError, ingest_csv
from app.services.data_quality import build_data_quality
from app.storage.database import GoldlensDB

router = APIRouter(prefix="/api")


@router.post("/ingest", response_model=IngestResponse)
def ingest(request: IngestRequest) -> IngestResponse:
    """Invalidate a CSV into the local store. Non-destructive: the source file
    is opened read-only; the database updates idempotently."""
    path = Path(request.path) if request.path else DEFAULT_CSV_PATH
    try:
        observations, rejected, report = ingest_csv(path)
    except FileNotFoundError as err:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "not_found", "message": str(err), "details": {}}},
        ) from err
    except (MissingColumnError, InvalidCsvError) as err:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "invalid_input", "message": str(err), "details": {}}},
        ) from err

    db: GoldlensDB = deps.get_db()
    stats = db.store_ingest(observations, report)

    dq = build_data_quality(db)
    warnings = [i.model_dump() for i in dq.issues if i.count]
    warned_rows = sum(1 for o in observations if o.validation_flags)
    return IngestResponse(
        ingestion_id=stats.run_id,
        accepted_rows=report.accepted_row_count,
        rejected_rows=report.rejected_row_count,
        warned_rows=warned_rows,
        warnings=warnings,
    )
