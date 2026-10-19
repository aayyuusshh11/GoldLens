# GoldLens Methodology — Items to Confirm with Quant Owner

This document records the implementation behavior visible in the supplied integration boundary and lists details that require confirmation from Kushwaha's underlying modules.

## Confirmed from `api.py`

- Input frame columns are defined in `REQUIRED_FRAME_COLUMNS`.
- The pipeline validates input, selects a near/far pair, builds spread observations, computes rolling z-scores, computes daily filters, runs the backtest, splits train/test, and may run walk-forward folds.
- `CAMPAIGN_MIN_DAYS` is 30.
- A report is only marked valid when the number of spread observations is at least `max(CAMPAIGN_MIN_DAYS, cfg.min_test_days)`.
- Costs absent means net metrics are withheld/labeled; the report notes `costs_not_configured`.
- The report carries a human-readable `verdict` and `is_valid_backtest`.
- `exec_mode` is exposed in config; the sample uses `next_close`.

## Must be documented by the quant owner

1. Exact spread sign convention and units.
2. How `lot_size_g` and `quote_basis_g` affect price comparability.
3. Pair-selection and expiry-roll behavior.
4. Stale-row definition and handling.
5. Rolling z-score window, minimum-history and zero-variance behavior.
6. Signal labels and entry/exit/stop semantics.
7. Execution assumptions for each `exec_mode`.
8. P&L formula and lot sizing.
9. Cost fields and the assumptions required for net metrics.
10. Sharpe annualization, drawdown convention, win-rate definition and treatment of open trades.
11. Train/test split and walk-forward comparison field definitions.
12. Specification source and effective-date handling.

Do not guess at any item above. Read the quant package implementation and write the confirmed rule here.

## Research integrity

A large absolute z-score is not proof of mean reversion. Daily bhavcopy observations do not prove executable fills or intraday liquidity. Historical results do not guarantee future outcomes. Keep gross and net metrics separate. If costs are absent, do not claim net profitability.
