# Frontend Agent Prompt — Aayush Thakre

Read `README.md`, `SKILLS.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/API_CONTRACT.md`, `docs/DATA_SCHEMA.md`, `docs/METHODOLOGY.md`, and `docs/DESIGN_SYSTEM.md` before coding. Inspect the existing repository first.

You own the React/Vite/TypeScript frontend and integration UX. Kushwaha's `reference/quant/api.py` is a Python quant boundary, not an HTTP server. The backend team must expose HTTP routes that return its serialized `BacktestReportDTO`.

Build these screens:
1. Overview: data provenance, date range, trading days, validity/verdict.
2. Pair Explorer: near/far expiries and spread observations.
3. Signal Forensics: z-score, signal, filters, rationale and no-trade reason.
4. Backtest: metrics, trades, train/test and walk-forward results where present.
5. Eligible Contracts: eligibility, reason, volume, OI, value and verified spec fields.
6. Data Quality: source status, gaps, rejected rows and specification warnings.

Use the exact snake_case fields in `docs/API_CONTRACT.md` and define TypeScript interfaces in `frontend/src/types/api.ts`. Centralize requests in `frontend/src/lib/api.ts`. Do not duplicate quant calculations in React.

Follow `SKILLS.md`: no fabricated metrics, fake live status, generic dashboard slop or dead buttons. Null means unavailable/not computed, never zero. Show a clear diagnostics-only state when `is_valid_backtest` is false or `metrics.status` is `diagnostics_only`. Hide or mark net P&L as unavailable when costs are not configured.

Work in thin vertical slices. Run the production build and tests, then report exact changed files, commands executed, actual results and remaining defects. Never claim an unrun check passed.
