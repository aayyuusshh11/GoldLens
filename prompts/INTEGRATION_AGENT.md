# Integration Agent Prompt

Act as integration engineer for GoldLens. Read the project docs and inspect the existing repository before modifying anything.

1. Preserve the supplied quant module and its relative imports.
2. Build FastAPI routes around `load_dataset`, `compute_eligible_contracts`, `compute_spreads`, `compute_zscores` and `run_strategy_backtest`.
3. Serialize report DTOs using `to_json_dict()`.
4. Translate `QuantAPIError.to_json()` into HTTP errors while preserving `error_code`, `message`, `details`.
5. Match the agreed response shape in `docs/API_CONTRACT.md`.
6. Verify that the supplied one-day sample renders as diagnostics-only and `is_valid_backtest: false`.
7. Ensure costs-unconfigured means net metrics are unavailable.
8. Add route tests for missing files, missing columns, all-zero volume, insufficient history and successful report serialization.
9. Add a core end-to-end test from loaded data to rendered report where practical.
10. Run backend tests and frontend production build; report actual results.

Do not rewrite quant logic, fabricate data, suppress warnings or claim success without test evidence. Return changed files, exact commands, test outcomes, blockers and a reproducible demo path.
