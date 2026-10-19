# GoldLens HTTP API Contract — Draft v1 aligned to the supplied quant DTO

## Important boundary distinction

`reference/quant/api.py` is a **Python module API**, not a FastAPI router. It exposes functions that a backend route should call:

- `load_dataset(sources) -> ValidatedDataset`
- `compute_eligible_contracts(frame, cfg) -> list[EligibleContractDTO]`
- `compute_spreads(frame, cfg, symbol) -> dict` (contains `observations`, `rejections`, and an internal `spread_frame`)
- `compute_zscores(sf, cfg) -> list[ZScorePointDTO]`
- `run_strategy_backtest(frame, cfg, symbol) -> BacktestReportDTO`
- `validate_bhavcopy_frame(frame) -> DataFrame`

The HTTP layer below is the proposed adapter contract. It must call those functions and serialize DTOs via `to_json_dict()`; it must not duplicate the quant logic.

## Conventions

- Base path `/api/v1`.
- JSON keys use the quant DTO's existing snake_case names.
- Dates are `YYYY-MM-DD`.
- Preserve `null` values; never coerce unavailable statistics to zero.
- All backtest report responses should preserve `data_provenance`, `verdict` and `is_valid_backtest`.
- Keep `config` and cost assumptions visible.
- The sample JSON is a serialized report, not a live market feed.
- Error mapping: `QuantAPIError.to_json()` returns `{ "error_code": "...", "message": "...", "details": {} }`. Suggested HTTP status: schema error 422, data-quality rejection 422 or 409 depending on context, unexpected error 500. Keep the JSON error fields.

## GET `/api/v1/health`

Proposed lightweight HTTP health route, not currently defined in `api.py`.

```json
{ "status": "ok", "service": "goldlens-api", "quant_module": "loaded" }
```

Health should not claim that valid historical data exists merely because the process is alive.

## GET `/api/v1/report?symbol=GOLDM`

Runs or retrieves a report for a symbol family using configured data sources and strategy config. Exact source selection and config loading must be agreed with backend/quant owners.

Response: serialized `BacktestReportDTO`, with these top-level keys:

```json
{
  "config": {},
  "data_provenance": {
    "trading_days": 0,
    "date_range": [],
    "spec_checks": []
  },
  "pair": {},
  "spread_observations": [],
  "z_score": [],
  "signals": [],
  "trades": [],
  "eligible_contracts": [],
  "metrics": null,
  "train_metrics": null,
  "test_metrics": null,
  "walk_forward_cmp": [],
  "verdict": "",
  "is_valid_backtest": false
}
```

The object above shows the contract shape only; it is not a valid result. Use the supplied sample file to inspect concrete field names.

## Report fields

### `config`
Expected keys in the supplied sample: `lookback_days`, `z_entry`, `z_exit`, `stop_z`, `max_holding_days`, `min_hist_days`, `exec_mode`, `allow_overlap`, `lots_per_leg`, `walk_forward_folds`, `costs`.

### `data_provenance`
- `trading_days`: distinct trading days in the source frame.
- `date_range`: first and last dates.
- `spec_checks`: source/specification cross-check messages, if available.

### `pair`
- `symbol`, `near_expiry`, `far_expiry`
- `rejections`: counts such as invalid price rows dropped and stale rows flagged.
- `filter_failures`: count of filter failures.

### `spread_observations[]`
`trade_date`, `symbol`, `near_expiry`, `far_expiry`, `near_close`, `far_close`, `spread`, `stale`.

### `z_score[]`
`trade_date`, `spread`, `rolling_mean`, `rolling_std`, `z`. Rolling fields can be null when history is insufficient.

### `signals[]`
`trade_date`, `signal`, `z`, `spread`, `mean`, `std`, `filters_ok`, `filter_reason`, `position_before`, `rationale`, `no_trade_reason`.

### `trades[]`
`leg_symbol`, `direction`, `entry_signal_date`, `entry_exec_date`, `entry_spread`, `entry_z`, `entry_rationale`, `exit_exec_date`, `exit_spread`, `exit_reason`, `gross_pnl_rupees`, `holding_days`.

### `eligible_contracts[]`
`trade_date`, `symbol`, `expiry`, `days_to_expiry`, `close`, `volume_lots`, `open_interest_lots`, `value_lakhs`, `eligible`, `reason`, `lot_size_g`, `quote_basis_g`.

### `metrics`
`status`, `n_days`, `n_trades`, `gross_pnl_rupees`, `net_pnl_rupees`, `win_rate`, `max_drawdown_rupees`, `net_max_drawdown_rupees`, `sharpe_ratio`, `net_sharpe_ratio`, `total_cost_rupees`, `avg_pnl_per_trade`, `notes`, `costs_assumption`.

### Remaining top-level fields
- `train_metrics`, `test_metrics`: metrics object or null.
- `walk_forward_cmp`: list of fold-comparison results; inspect implementation for exact inner keys.
- `verdict`: human-readable validity/limitation statement.
- `is_valid_backtest`: boolean validity gate.

## Proposed supporting routes

### GET `/api/v1/eligible-contracts?symbol=GOLDM` (optional)
Returns an object such as `{ "items": [...] }` based on `compute_eligible_contracts`. Use the full report endpoint if this duplicates computation unnecessarily.

### GET `/api/v1/data-quality`
Returns source paths, date range, distinct trading days, required-column validation and specification checks. This endpoint is a proposed HTTP adapter; its exact schema must be agreed with the backend owner.

### POST `/api/v1/report`
Optional if report generation requires a body. Request should define `symbol` and explicitly whitelisted strategy overrides. Do not accept arbitrary Python paths or arbitrary config fields from public clients.

## Error shape

```json
{
  "error_code": "invalid_input_schema",
  "message": "frame missing required columns",
  "details": {
    "missing_columns": ["close"]
  }
}
```

Actual boundary error codes in supplied module:
- `quant_error`
- `invalid_input_schema`
- `data_quality_rejected`

## Sample data interpretation

The provided sample's `data_provenance.trading_days` is 1; `spread_observations` contains one point; `z_score` is null for rolling statistics; `signals` says `NO TRADE` because history is insufficient; `metrics.status` is `diagnostics_only`; `metrics.net_pnl_rupees` is null because costs are not configured; `is_valid_backtest` is false. The UI must preserve and explain these values.
