"""GoldLens ingestion CLI.

Usage (from backend/):
    python -m app.cli ingest                        # uses the default supplied CSV
    python -m app.cli ingest "path/to/file.csv"     # explicit file
    python -m app.cli ingest --json file.csv        # machine-readable output

Prints a concise validation report. The source file is read-only.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.config import DEFAULT_CSV_PATH
from app.services.ingest import (
    MissingColumnError,
    InvalidCsvError,
    ingest_csv,
    report_render,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="goldlens", description="GoldLens data CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p_ingest = sub.add_parser("ingest", help="ingest a bhavcopy CSV and print the validation report")
    p_ingest.add_argument("csv_path", nargs="?", default=None, help="source CSV path (default: supplied file)")
    p_ingest.add_argument("--json", action="store_true", help="emit machine-readable JSON report")
    p_ingest.add_argument("--store", action="store_true", help="also persist into the DuckDB store (idempotent)")

    args = parser.parse_args(argv)

    if args.command == "ingest":
        path = Path(args.csv_path) if args.csv_path else DEFAULT_CSV_PATH
        try:
            observations, rejected, report = ingest_csv(path)
        except FileNotFoundError as err:
            print(f"ERROR: {err}", file=sys.stderr)
            return 2
        except (MissingColumnError, InvalidCsvError) as err:
            print(f"ERROR: {err}", file=sys.stderr)
            return 3
        if args.store:
            from app.config import DB_PATH
            from app.storage.database import GoldlensDB

            with GoldlensDB(DB_PATH) as db:
                stats = db.store_ingest(observations, report)
                print(
                    f"stored: run_id={stats.run_id} "
                    f"observations_inserted={stats.observations_inserted} "
                    f"observations_skipped={stats.observations_skipped} "
                    f"contracts_inserted={stats.contracts_inserted} "
                    f"db={db.path}"
                )
        print(report_render(report, as_json=args.json))
        if rejected:
            first = rejected[:5]
            print(f"\nsample rejected rows ({len(rejected)} total):")
            for r in first:
                print(f"  row {r.source_row}: {r.reason_code} — {r.reason}")
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
