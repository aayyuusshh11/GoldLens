# GoldLens — Shared API Contract (Phase 1)

Owner: **Araham (Arhm) Jain** (data engineering/backend). Consumers: **Aayush Thakre** (frontend), **Aayush S. Kushwaha** (quant, integration via boundary API `api.py`).

- All endpoints JSON, `Content-Type: application/json`; snake_case fields; ISO-8601 dates (`YYYY-MM-DD`).
- **Missing values are `null`, never `0`, never `""`.**
- Backend implementation must not fill gaps with fabricated values: with one trading day of data, signals/backtests/health must surface `INSUFFICIENT_HISTORY` rather than computed history. Quant formulas live in the quant service (Aayush S.K.); backend wires cleanly and refuses gracefully.
- Base path: none (e.g. `http://127.0.0.1:8000/api/health`).

---

## 0. Common shapes

### Error (all non-2xx responses)

```json
{ "error": { "code": "not_found", "message": "...", "details": { "any": "typed extras" } } }
```

`code` ∈ `invalid_input` | `not_found` | `data_unavailable` | `internal_error`.

### Warning/tool note item (used throughout)

```json
{ "code": "INSUFFICIENT_HISTORY", "severity": "warning", "count": 1, "message": "…" }
```

`severity` ∈ `info` | `warning` | `error` | `critical`.

---

## 1. `GET /api/health`

```json
{ "status": "healthy", "service": "goldlens-backend", "version": "0.1.0", "data_available": true, "distinct_trade_dates": 1, "latest_data_date": "2026-10-16" }
```

`data_available` mirrors whether observations exist in storage (false if empty DB, `distinct_trade_dates` 0, `latest_data_date` null).

## 2. `GET /api/contracts?symbol=GOLD&verified=any&limit=500&offset=0`

Returns contract registry records (shape per DATA_SCHEMA §3). Query params optional; `symbol` matches canonical trimmed symbol; `limit` default 500. Response:

```json
{
  "total": 15,
  "count": 15,
  "offset": 0,
  "contracts": [
    {
    "contract_id": "FUTCOM_GOLD_20261204",
    "symbol": "GOLD",
    "instrument_type": "FUTCOM",
    "expiry_date": "2026-12-04",
    "contract_size": null,
    "units": null,
    "quotation_unit": null,
    "purity": null,
    "tick_size": null,
    "expiry_rule": null,
    "verification_status": "unverified",
    "verified_fields": [],
    "source": null,
    "verification_timestamp": null,
    "effective_from": null,
    "effective_to": null,
    "first_observed_date": "2026-10-16",
    "last_observed_date": "2026-10-16"
    }
  ]
}
```

No contract size/purity/quote unit may ever appear non-null unless verified (`verification_timestamp` + `source` set). Unknown stays null.

## 3. `GET /api/pairs`

Candidate comparable pairs of **verified-eligible** contracts, near/far expiry, same canonical symbol. Selection criteria are quant-owned; until thresholds are confirmed, backend lists observed near/far combinations with explicit status.

```json
{
  "pairs": [
    {
      "pair_id": "GOLDM_near20261204_far20270105",
      "symbol": "GOLDM",
      "near": { "contract_id": "FUTCOM_GOLDM_20261204", "expiry_date": "2026-12-04" },
      "far":  { "contract_id": "FUTCOM_GOLDM_20270105", "expiry_date": "2027-01-05" },
      "status": "candidate_only",
      "reason_codes": ["UNVERIFIED_SPEC"],
      "history_days": 1
    }
  ],
  "warnings": [ { "code": "UNVERIFIED_SPEC", "severity": "warning", "count": 15, "message": "…" } ]
}
```

`status` ∈ `candidate_only` | `eligible` (once quant thresholds + verified specs agree that day). No pair is ever marked tradeable from a single day.

## 4. `GET /api/pairs/{pair_id}/history?start_date=&end_date=`

```json
{
  "pair_id": "GOLDM_near20261204_far20270105",
  "symbol": "GOLDM",
  "near_expiry": "2026-12-04",
  "far_expiry": "2027-01-05",
  "observations": [ { "trade_date": "2026-10-16", "near_close": 147866.0, "far_close": 149227.0, "spread": 1361.0, "status": "single_reference", "reason_codes": ["STALE_PRICE"] } ],
  "count": 1,
  "warnings": [ { "code": "INSUFFICIENT_HISTORY", "severity": "warning", "count": 1, "message": "…" } ]
}
```

With one date, `observations` may be a single reference row or empty; multi-day series never exists at this stage. `spread` here is the arithmetic difference of the two reported closes (unit = INR), explicitly labeled reference/`single_reference` when zero-volume rows are involved.

## 5. `POST /api/signals/analyze`

Request:

```json
{ "pair_id": "GOLDM_near20261204_far20270105", "as_of_date": "2026-10-16" }
```

Response — required fields (agreed; extra optional fields allowed):

```json
{
  "pair_id": "GOLDM_near20261204_far20270105",
  "as_of_date": "2026-10-16",
  "decision": "NO_TRADE",
  "reason_codes": ["INSUFFICIENT_HISTORY", "UNVERIFIED_SPEC"],
  "spread": 1361.0,
  "z_score": null,
  "gross_edge": null,
  "estimated_cost": null,
  "net_edge": null,
  "data_quality": { "distinct_trade_dates": 1, "latest_data_date": "2026-10-16", "trading_days_available": 1, "warnings": [ { "code": "INSUFFICIENT_HISTORY", "severity": "warning", "count": 1, "message": "…" } ] },
  "notes": "z-score/EV fields left null until multi-day data arrives; nothing fabricated"
}
```

- `decision` ∈ `NO_TRADE` | `BUY_NEAR_SELL_FAR` | `SELL_NEAR_BUY_FAR` (enum wording pending quant confirmation — §6 in DATA_SCHEMA.md).
- **Never** invent z-scores/costs from one day; `null` + `reason_codes` is the honest response.

## 6. `POST /api/backtests/run`

Request:

```json
{ "pair_id": "GOLDM_near20261204_far20270105", "start_date": "2026-10-16", "end_date": "2026-10-16", "strategy_version": "default" }
```

Response — required fields (agreed):

```json
{
  "run_id": "bt_20261020T101520Z_0001",
  "pair_id": "GOLDM_near20261204_far20270105",
  "strategy_version": "default",
  "evaluation_period": { "start_date": "2026-10-16", "end_date": "2026-10-16" },
  "observation_count": 0,
  "completed_trades": 0,
  "gross_pnl": null,
  "estimated_costs": null,
  "net_pnl": null,
  "max_drawdown": null,
  "assumptions": [],
  "warnings": [ { "code": "INSUFFICIENT_HISTORY", "severity": "error", "count": 1, "message": "walking-forward backtest refused: 1 distinct trade date < minimum" } ],
  "runnable": false
}
```

- `runnable: false` + nulls whenever historicity minimum (agreed minimum with quant, currently ≥ 30 spread observations) is unmet. No fake observation counts/P&L.

## 7. `GET /api/data-quality`

```json
{
  "generated_at": "2026-10-20T10:30:00Z",
  "sources": [ { "file": "BhavCopyDateWise_16102026 (2).csv", "ingested_at": "2026-10-20T10:05:12Z", "input_rows": 15535, "output_columns": 15, "unique_dates": 1, "dates": ["2026-10-16"], "status": "ingested" } ],
  "rows": { "total": 15535, "future_rows": 168, "options_rows": 14730, "index_futures_rows": 7, "index_options_rows": 630, "accepted": 15535, "rejected": 0, "warned": 14592 },
  "issues": [
    { "code": "ZERO_VOLUME_ROWS", "severity": "warning", "count": 14592, "message": "…" },
    { "code": "MISSING_VOLUME_ROWS", "severity": "warning", "count": 0, "message": "…" },
    { "code": "MISSING_OHLC_ROWS", "severity": "warning", "count": 14592, "message": "…" },
    { "code": "MISSING_SETTLEMENT_ROWS", "severity": "critical", "count": 15535, "message": "..." },
    { "code": "ZERO_OI_ROWS", "severity": "info", "count": 14346, "message": "…" },
    { "code": "INVALID_OHLC_RANGE_ROWS", "severity": "error", "count": 0, "message": "…" },
    { "code": "DUPLICATE_BUSINESS_KEYS", "severity": "error", "count": 0, "message": "…" },
    { "code": "UNSUPPORTED_INSTRUMENT_ROWS", "severity": "info", "count": 15360, "message": "…" }
  ],
  "contract_spec_verification": { "verified": 0, "unverified": 15, "conflicting": 0 },
  "history_sufficiency": { "distinct_trade_dates": 1, "minimum_required": 30, "sufficient_for_signal": false, "sufficient_for_backtest": false }
}
```

Zero volume and missing volume are separated (`ZERO_VOLUME_ROWS` vs `MISSING_VOLUME_ROWS`). Contract spec verification status always visible. Data quality **never** claims multi-day history when only one date exists.

## 8. `POST /api/ingest` (internal utility; not for frontend)

```json
Request: { "path": "relative/or/absolute/path.csv" }        // default: bundled CSV
Response: { "accepted_rows": 15535, "rejected_rows": 0, "warned_rows": 14592, "ingestion_id": "ing_...", "warnings": [...] }
```

---

## 9. HTTP status mapping

| Status | When |
|---|---|
| 200 | success (including `runnable:false` backtest refusal body) |
| 400 | malformed request body / unknown enum |
| 404 | unknown `pair_id` / unknown route |
| 409 | duplicate ingestion conflicts that cannot be upserted |
| 422 | validation error (FastAPI default body for request validation) |
| 503 | storage unavailable (no DB file / empty and unrebuildable) |

## 10. Decisions pending confirmation (carried from DATA_SCHEMA §6)

1. Signal `decision` enum wording (quant).
2. Backtest historical minimums: observation count and distinct-date count (quant: proposed ≥ 30 obs / ≥ 30 days).
3. `pair_id` format `SYMBOL_nearYYYYMMDD_farYYYYMMDD` (frontend confirm readability).
4. default `limit=500` for `/api/contracts` (frontend confirm).
