"""Business-logic services (ingestion, data quality)."""
from app.services.ingest import ingest_csv, gold_futures_rows, report_render

__all__ = ["ingest_csv", "gold_futures_rows", "report_render"]
