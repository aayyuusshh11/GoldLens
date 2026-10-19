# GoldLens Data Schema

## Quant input frame

The supplied `api.py` requires these exact columns (`REQUIRED_FRAME_COLUMNS`):

| Column | Meaning / handling |
|---|---|
| `trade_date` | Trading date; at least some valid values required |
| `symbol` | Contract family/symbol, e.g. GOLD or GOLDM |
| `instrument` | Instrument classification from source |
| `expiry_ts` | Contract expiry timestamp/date |
| `close` | Source close price used by the current pipeline |
| `volume_lots` | Traded lots; all-zero volume causes data-quality rejection |
| `open_interest_lots` | Open interest in lots |
| `value_lakhs` | Traded value in lakhs |

`validate_bhavcopy_frame` rejects a non-DataFrame or missing required columns with `SchemaError`, rejects empty/no-valid-date/no-traded-row frames with `DataQualityError`, and returns a valid frame unchanged.

## Output DTOs

The Python boundary serializes dataclasses to JSON-compatible dictionaries.

- `EligibleContractDTO`: trade date, symbol, expiry, days to expiry, close, volume/OI/value, eligibility and reason, `lot_size_g`, `quote_basis_g`.
- `SpreadPointDTO`: trade date, symbol, near/far expiry, near/far close, spread, stale.
- `ZScorePointDTO`: trade date, spread, rolling mean/std and z; statistics may be null.
- `SignalDTO`: signal, z/spread/mean/std, filters, position before, rationale and no-trade reason.
- `TradeDTO`: leg, direction, entry/exit dates and spreads, rationale, gross rupee P&L and holding days.
- `MetricsDTO`: status, days/trades, gross/net rupee P&L, win rate, drawdowns, Sharpe values, costs, average P&L, notes and cost assumption.
- `BacktestReportDTO`: config, provenance, pair, spread observations, z-scores, signals, trades, eligible contracts, full/train/test metrics, walk-forward comparisons, verdict and validity flag.

## Data and validity rules from the boundary

- `CAMPAIGN_MIN_DAYS = 30` in the supplied module.
- Backtest validity requires spread observations at least `max(30, cfg.min_test_days)`.
- `metrics.status` is `diagnostics_only` when metric days are below `cfg.min_days_for_sharpe`; otherwise `backtest`.
- If costs are not configured, the DTO appends `costs_not_configured`, describes costs as not supplied, and withholds net metrics.
- Preserve nulls. Null z-score is not zero z-score.
- Preserve provenance source paths and trading-day count.
- Do not label one-day output as a valid backtest.

## Contract registry caution

`lot_size_g` and `quote_basis_g` can be null when a symbol has no verified specification. Do not infer them from the symbol name. The frontend should expose unverified/unknown states rather than implying every listed contract is comparable.
