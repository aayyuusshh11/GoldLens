"""DuckDB storage layer: normalized observations + contract registry.

Design (Phase 3, IMPLEMENTATION_PHASES_ARHM.txt):

- Separate stores:
  * `observations` — one row per (trade_date, contract) observation.
  * `contracts`    — the provenance-aware contract registry.
  * `ingest_runs`  — audit row per ingestion with the full report JSON.
- Idempotency: the documented business key is
  (trade_date, instrument_type, symbol, expiry_date, option_type, strike_price).
  Deduplication uses a NULL-safe anti-join (`IS NOT DISTINCT FROM`) because SQL
  UNIQUE treats NULLs as distinct; anti-join makes re-ingestion strictly
  idempotent even for rows with NULL/missing expiry.
- Registry: every specification column starts NULL / `unverified`. Nothing is
  inferred from symbol names; verification requires a cited source stamp.
- The source CSV is never touched; the DB is fully rebuildable from input.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb

from app.config import DB_PATH
from app.schemas.models import IngestReport, NormalizedObservation

OBSERVATIONS_DDL = """
CREATE TABLE IF NOT EXISTS observations (
    trade_date             VARCHAR NOT NULL,
    instrument_type        VARCHAR NOT NULL,
    symbol                 VARCHAR NOT NULL,
    expiry_date            VARCHAR,
    option_type            VARCHAR,
    strike_price           DOUBLE,
    contract_id            VARCHAR NOT NULL,
    symbol_raw             VARCHAR NOT NULL,
    open                   DOUBLE,
    high                   DOUBLE,
    low                    DOUBLE,
    close                  DOUBLE,
    previous_close         DOUBLE,
    settlement_price       DOUBLE,
    volume_lots            DOUBLE,
    volume_quantity        DOUBLE,
    volume_unit            VARCHAR,
    value_lacs             DOUBLE,
    open_interest_lots     DOUBLE,
    has_ohlc               BOOLEAN NOT NULL,
    zero_volume            BOOLEAN NOT NULL,
    is_tradable_candidate  BOOLEAN NOT NULL,
    source_file            VARCHAR NOT NULL,
    source_row             INTEGER NOT NULL,
    ingested_at            VARCHAR NOT NULL,
    validation_flags       VARCHAR[] NOT NULL
)
"""

CONTRACTS_DDL = """
CREATE TABLE IF NOT EXISTS contracts (
    contract_id             VARCHAR PRIMARY KEY,
    symbol                  VARCHAR NOT NULL,
    instrument_type         VARCHAR NOT NULL,
    expiry_date             VARCHAR,
    contract_size           DOUBLE,      -- NULL until verified; never guessed
    units                   VARCHAR,     -- NULL until verified
    quotation_unit          VARCHAR,     -- NULL until verified
    purity                  VARCHAR,     -- NULL until verified
    tick_size               DOUBLE,      -- NULL until verified
    expiry_rule             VARCHAR,     -- NULL until verified
    verification_status     VARCHAR NOT NULL DEFAULT 'unverified',
    verified_fields         VARCHAR[] NOT NULL DEFAULT [],
    source                  VARCHAR,
    verification_timestamp  VARCHAR,
    effective_from          VARCHAR,
    effective_to            VARCHAR,
    first_observed_date     VARCHAR,
    last_observed_date      VARCHAR,
    updated_at              VARCHAR
)
"""

INGEST_RUNS_DDL = """
CREATE TABLE IF NOT EXISTS ingest_runs (
    run_id                VARCHAR PRIMARY KEY,
    source_file           VARCHAR NOT NULL,
    source_mode           VARCHAR NOT NULL,  -- 'readonly'
    input_row_count       INTEGER NOT NULL,
    accepted_rows         INTEGER NOT NULL,
    rejected_rows         INTEGER NOT NULL,
    observations_inserted INTEGER NOT NULL,
    observations_skipped  INTEGER NOT NULL,
    contracts_inserted    INTEGER NOT NULL,
    report_json           VARCHAR NOT NULL,
    ingested_at           VARCHAR NOT NULL
)
"""

_BATCH_DDL = """
CREATE OR REPLACE TEMP TABLE _batch (
    trade_date VARCHAR, instrument_type VARCHAR, symbol VARCHAR,
    expiry_date VARCHAR, option_type VARCHAR, strike_price DOUBLE,
    contract_id VARCHAR, symbol_raw VARCHAR,
    open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE,
    previous_close DOUBLE, settlement_price DOUBLE,
    volume_lots DOUBLE, volume_quantity DOUBLE, volume_unit VARCHAR,
    value_lacs DOUBLE, open_interest_lots DOUBLE,
    has_ohlc BOOLEAN, zero_volume BOOLEAN, is_tradable_candidate BOOLEAN,
    source_file VARCHAR, source_row INTEGER, ingested_at VARCHAR,
    validation_flags VARCHAR[]
)
"""

_INSERT_BATCH_SQL = (
    "INSERT INTO _batch VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
)

_BUSINESS_KEY_COLUMNS = ("trade_date", "instrument_type", "symbol", "expiry_date",
                         "option_type", "strike_price")

_OBS_COLUMNS = (
    "trade_date", "instrument_type", "symbol", "expiry_date", "option_type",
    "strike_price", "contract_id", "symbol_raw", "open", "high", "low", "close",
    "previous_close", "settlement_price", "volume_lots", "volume_quantity",
    "volume_unit", "value_lacs", "open_interest_lots", "has_ohlc", "zero_volume",
    "is_tradable_candidate", "source_file", "source_row", "ingested_at",
    "validation_flags",
)


@dataclass
class IngestStorageStats:
    run_id: str
    source_file: str
    observations_inserted: int
    observations_skipped: int
    contracts_inserted: int
    contracts_updated: int


class StorageError(RuntimeError):
    """Raised for storage availability/usage problems."""


class GoldlensDB:
    """Thin DuckDB wrapper; schema is ensured on every connection."""

    def __init__(self, path: Path | str = DB_PATH):
        self.path = Path(path)
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.con = duckdb.connect(str(self.path))
        except Exception as err:  # pragma: no cover - environment specific
            raise StorageError(f"cannot open DuckDB database at {self.path}: {err}") from err
        self.con.execute(OBSERVATIONS_DDL)
        self.con.execute(CONTRACTS_DDL)
        self.con.execute(INGEST_RUNS_DDL)

    def close(self) -> None:
        try:
            self.con.close()
        except Exception:  # pragma: no cover
            pass

    def __enter__(self) -> "GoldlensDB":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    # ------------------------------------------------------------------ #
    # Ingestion persistence                                              #
    # ------------------------------------------------------------------ #

    def store_ingest(
        self,
        observations: list[NormalizedObservation],
        report: IngestReport,
    ) -> IngestStorageStats:
        """Persist an idempotent ingestion. Running the same file twice inserts
        nothing new and leaves original provenance untouched."""
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        run_id = f"ing_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-%f')}"

        before = self.observation_count()

        self.con.execute(_BATCH_DDL)
        if observations:
            self.con.executemany(
                _INSERT_BATCH_SQL, [_observation_payload(o) for o in observations]
            )
            key_match = " AND ".join(
                f"b.{c} IS NOT DISTINCT FROM o.{c}" for c in _BUSINESS_KEY_COLUMNS
            )
            key_cols = ", ".join(_BUSINESS_KEY_COLUMNS)
            # 1) keep only the FIRST occurrence per business key within the batch
            #    (deterministic: lowest source_row); 2) skip keys already stored.
            self.con.execute(f"""
                WITH batch_ranked AS (
                    SELECT b.*, row_number() OVER (
                        PARTITION BY ({key_cols})
                        ORDER BY b.source_row
                    ) AS _rk
                    FROM _batch b
                )
                INSERT INTO observations
                SELECT {', '.join('b.' + c for c in _OBS_COLUMNS)}
                FROM batch_ranked b
                WHERE b._rk = 1 AND NOT EXISTS (
                    SELECT 1 FROM observations o WHERE {key_match}
                )
            """)

        after = self.observation_count()
        inserted = after - before
        skipped = len(observations) - inserted

        inserted_contracts = updated_contracts = 0
        for contract in self._contracts_from(observations):
            existing = self.con.execute(
                "SELECT contract_id FROM contracts WHERE contract_id = ?",
                [contract["contract_id"]],
            ).fetchone()
            if existing is None:
                self.con.execute(
                    """
                    INSERT INTO contracts (
                        contract_id, symbol, instrument_type, expiry_date,
                        verification_status, verified_fields,
                        first_observed_date, last_observed_date, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        contract["contract_id"], contract["symbol"],
                        contract["instrument_type"], contract["expiry_date"],
                        "unverified", [],
                        contract["first_observed_date"], contract["last_observed_date"],
                        now,
                    ],
                )
                inserted_contracts += 1
            else:
                self.con.execute(
                    """
                    UPDATE contracts
                    SET last_observed_date = greatest(last_observed_date, ?),
                        first_observed_date = CASE
                            WHEN first_observed_date IS NULL OR ? < first_observed_date
                            THEN ? ELSE first_observed_date END,
                        updated_at = ?
                    WHERE contract_id = ?
                    """,
                    [
                        contract["last_observed_date"],
                        contract["first_observed_date"], contract["first_observed_date"],
                        now, contract["contract_id"],
                    ],
                )
                updated_contracts += 1

        self.con.execute(
            """
            INSERT INTO ingest_runs
                (run_id, source_file, source_mode, input_row_count, accepted_rows,
                 rejected_rows, observations_inserted, observations_skipped,
                 contracts_inserted, report_json, ingested_at)
            VALUES (?, ?, 'readonly', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                run_id, report.input_file, report.input_row_count,
                report.accepted_row_count, report.rejected_row_count,
                inserted, skipped, inserted_contracts,
                json.dumps(report.model_dump(), indent=2), now,
            ],
        )

        return IngestStorageStats(
            run_id=run_id,
            source_file=report.input_file,
            observations_inserted=inserted,
            observations_skipped=skipped,
            contracts_inserted=inserted_contracts,
            contracts_updated=updated_contracts,
        )

    # ------------------------------------------------------------------ #
    # Queries                                                            #
    # ------------------------------------------------------------------ #

    def _rows_as_dicts(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
        cur = self.con.execute(sql, params or [])
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    def observation_count(self) -> int:
        return int(self.con.execute("SELECT count(*) FROM observations").fetchone()[0])

    def distinct_trade_dates(self) -> list[str]:
        rows = self.con.execute(
            "SELECT DISTINCT trade_date FROM observations ORDER BY trade_date"
        ).fetchall()
        return [r[0] for r in rows]

    def list_contracts(self, symbol: str | None = None, limit: int = 500, offset: int = 0) -> list[dict[str, Any]]:
        if symbol is not None:
            where, params = "WHERE symbol = ?", [symbol]
        else:
            where, params = "", []
        return self._rows_as_dicts(
            f"SELECT * FROM contracts {where} ORDER BY contract_id LIMIT {int(limit)} OFFSET {int(offset)}",
            params,
        )

    def contract_total(self) -> int:
        return int(self.con.execute("SELECT count(*) FROM contracts").fetchone()[0])

    def verification_counts(self) -> dict[str, int]:
        rows = self.con.execute(
            "SELECT verification_status, count(*) FROM contracts GROUP BY 1"
        ).fetchall()
        base = {"verified": 0, "unverified": 0, "conflicting": 0}
        for status, count in rows:
            base[str(status)] = int(count)
        return base

    def contracts_needing_verification(self) -> list[dict[str, Any]]:
        return self._rows_as_dicts(
            """
            SELECT contract_id, symbol, instrument_type, expiry_date, verified_fields
            FROM contracts
            WHERE verification_status <> 'verified'
            ORDER BY contract_id
            """
        )

    def quality_counts(self) -> dict[str, Any]:
        cols = [
            "total_rows", "distinct_dates", "min_date", "max_date", "futcom_rows",
            "option_rows", "futidx_rows", "missing_ohlc_rows", "zero_volume_rows",
            "missing_volume_rows", "zero_oi_rows", "missing_oi_rows",
            "invalid_range_rows", "stale_price_rows", "unsupported_rows",
            "no_unit_rows",
        ]
        row = self.con.execute("""
            SELECT
                count(*) as total_rows,
                count(DISTINCT trade_date) as distinct_dates,
                min(trade_date) as min_date,
                max(trade_date) as max_date,
                coalesce(count_if(instrument_type = 'FUTCOM'), 0) as futcom_rows,
                coalesce(count_if(instrument_type IN ('OPTFUT','OPTIDX')), 0) as option_rows,
                coalesce(count_if(instrument_type = 'FUTIDX'), 0) as futidx_rows,
                coalesce(count_if(NOT has_ohlc), 0) as missing_ohlc_rows,
                coalesce(count_if(zero_volume), 0) as zero_volume_rows,
                coalesce(count_if(volume_lots IS NULL), 0) as missing_volume_rows,
                coalesce(count_if(open_interest_lots IS NOT NULL AND open_interest_lots = 0), 0) as zero_oi_rows,
                coalesce(count_if(open_interest_lots IS NULL), 0) as missing_oi_rows,
                coalesce(count_if(high IS NOT NULL AND low IS NOT NULL AND high < low), 0) as invalid_range_rows,
                coalesce(count_if(zero_volume AND close IS NOT NULL), 0) as stale_price_rows,
                coalesce(count_if(instrument_type <> 'FUTCOM'), 0) as unsupported_rows,
                coalesce(count_if(volume_quantity IS NOT NULL AND volume_unit IS NULL), 0) as no_unit_rows
            FROM observations
        """).fetchone()
        return dict(zip(cols, row))

    def duplicate_business_key_rows(self) -> int:
        n = self.con.execute("""
            WITH grouped AS (
                SELECT trade_date, instrument_type, symbol, expiry_date,
                       option_type, strike_price, count(*) AS n
                FROM observations
                GROUP BY trade_date, instrument_type, symbol, expiry_date,
                         option_type, strike_price
            )
            SELECT coalesce(sum(n - 1), 0) FROM grouped WHERE n > 1
        """).fetchone()[0]
        return int(n)

    def observations_by_symbol(
        self,
        symbol: str,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[dict[str, Any]]:
        sql = "SELECT * FROM observations WHERE symbol = ?"
        params: list[Any] = [symbol]
        if start_date:
            sql += " AND trade_date >= ?"
            params.append(start_date)
        if end_date:
            sql += " AND trade_date <= ?"
            params.append(end_date)
        sql += " ORDER BY trade_date, expiry_date"
        return self._rows_as_dicts(sql, params)

    def ingest_run_history(self) -> list[dict[str, Any]]:
        return self._rows_as_dicts(
            """
            SELECT run_id, source_file, source_mode, input_row_count, accepted_rows,
                   rejected_rows, observations_inserted, observations_skipped,
                   contracts_inserted, ingested_at
            FROM ingest_runs ORDER BY ingested_at DESC
            """
        )

    def latest_report_json(self) -> str | None:
        row = self.con.execute(
            "SELECT report_json FROM ingest_runs ORDER BY ingested_at DESC LIMIT 1"
        ).fetchone()
        return row[0] if row else None

    # ------------------------------------------------------------------ #
    # Registry verification (manual, source-cited)                       #
    # ------------------------------------------------------------------ #

    def verify_contract_fields(
        self,
        contract_id: str,
        fields: dict[str, Any],
        source: str,
        effective_from: str | None = None,
        effective_to: str | None = None,
    ) -> bool:
        """Mark specific registry fields verified — only with a cited source.

        Never called by automated ingestion. Unknown stays unknown otherwise.
        """
        allowed = ("contract_size", "units", "quotation_unit", "purity", "tick_size", "expiry_rule")
        if not source:
            raise ValueError("verification requires a source string")
        verifiable = sorted(f for f in fields if f in allowed)
        if not verifiable:
            raise ValueError(f"no verifiable fields supplied; allowed: {list(allowed)}")
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        set_sql = ", ".join(f"{f} = ?" for f in fields)
        params = list(fields.values()) + [
            verifiable,
            "verified",
            source,
            now,
            effective_from,
            effective_to,
            now,
            contract_id,
        ]
        self.con.execute(
            f"""
            UPDATE contracts
            SET {set_sql},
                verified_fields = ?,
                verification_status = CASE
                    WHEN verification_status = 'conflicting' THEN 'conflicting'
                    ELSE ? END,
                source = ?,
                verification_timestamp = ?,
                effective_from = coalesce(?, effective_from),
                effective_to = coalesce(?, effective_to),
                updated_at = ?
            WHERE contract_id = ?
            """,
            params,
        )
        return True

    # ------------------------------------------------------------------ #
    # helpers                                                            #
    # ------------------------------------------------------------------ #

    def _contracts_from(self, observations: list[NormalizedObservation]) -> list[dict[str, Any]]:
        """Registry candidates from observed identity fields only (never specs)."""
        seen: dict[str, dict[str, Any]] = {}
        for o in observations:
            cur = seen.get(o.contract_id)
            if cur is None:
                seen[o.contract_id] = {
                    "contract_id": o.contract_id,
                    "symbol": o.symbol,
                    "instrument_type": o.instrument_type,
                    "expiry_date": o.expiry_date,
                    "first_observed_date": o.trade_date or "",
                    "last_observed_date": o.trade_date or "",
                }
            elif o.trade_date:
                first, last = cur["first_observed_date"], cur["last_observed_date"]
                if not first or o.trade_date < first:
                    cur["first_observed_date"] = o.trade_date
                if not last or o.trade_date > last:
                    cur["last_observed_date"] = o.trade_date
        return list(seen.values())


def _observation_payload(o: NormalizedObservation) -> tuple[Any, ...]:
    return (
        o.trade_date, o.instrument_type, o.symbol, o.expiry_date, o.option_type,
        o.strike_price, o.contract_id, o.symbol_raw, o.open, o.high, o.low,
        o.close, o.previous_close, o.settlement_price, o.volume_lots,
        o.volume_quantity, o.volume_unit, o.value_lacs, o.open_interest_lots,
        o.has_ohlc, o.zero_volume, o.is_tradable_candidate, o.source_file,
        o.source_row, o.ingested_at, o.validation_flags,
    )
