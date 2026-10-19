# Implementation Plan — GoldLens
Owner: **Aayush Thakre (frontend/integration lead)** · Team: Aayush S. Kushwaha (quant), Araham Jain (data/backend) · Target: 3-day prototype

## First: reconcile against the actual files

The supplied `reference/quant/api.py` is the typed Python integration boundary. Its public functions include `load_dataset`, `compute_eligible_contracts`, `compute_spreads`, `compute_zscores`, and `run_strategy_backtest`. It uses relative imports, so keep it inside the existing quant package. Its `QuantAPIError` subclasses serialize as `{error_code, message, details}`.

The supplied `reference/samples/api_contract_sample.json` is a serialized `BacktestReportDTO` example, not an HTTP request/response envelope. It has one trading day and is explicitly **not a valid backtest**. Build HTTP routes around the quant functions; do not pretend these files already define FastAPI endpoints.

## Phase 0 — First 30 minutes

1. Inspect the existing repository, the quant package and source-data files.
2. Preserve Aayush Kushwaha's module and imports. Do not rewrite quant internals just to match a generic API template.
3. Copy/keep the two reference files and compare them with the existing source-of-truth files.
4. Review `docs/API_CONTRACT.md` with all three owners. Agree route names and request fields before frontend wiring.
5. Create branches:
   - `feature/frontend-shell` — Aayush Thakre
   - `feature/quant-integration` — Aayush S. Kushwaha
   - `feature/data-http-api` — Araham Jain
6. Add a sample JSON fixture for UI tests, clearly marked as one-day diagnostics.

**Gate:** everyone understands the difference between the Python quant boundary and the HTTP API.

## Day 1 — Make the real data path work

### Aayush Thakre
- Scaffold React + Vite + TypeScript.
- Follow `SKILLS.md` and `docs/DESIGN_SYSTEM.md`.
- Create app shell, navigation, typed API client, loading/error/empty states.
- Create `frontend/src/types/api.ts` from the actual report DTO.

### Aayush S. Kushwaha
- Explain config field meanings/defaults and signal labels.
- Confirm spread sign convention, expiry roll rules, stale observation behavior and threshold semantics.
- Confirm how costs are configured and which metrics become null without costs.
- Add/confirm tests for rolling z-score, filters and backtest validity.

### Araham Jain
- Inspect real bhavcopy inputs and report date coverage and columns.
- Implement ingestion/validation and preserve source provenance.
- Create FastAPI routes around the quant boundary.
- Ensure `QuantAPIError` becomes a suitable HTTP response without losing `error_code`, `message` or `details`.

**Day 1 exit:** frontend and backend run locally; health/data quality are visible; actual report schema is agreed.

## Day 2 — Core analytical workflow

### Aayush Thakre
- Overview: source date range, trading-day count, validity and warning state.
- Pair Explorer: near/far expiry and `spread_observations`.
- Signal Forensics: `z_score`, `signals`, filters and rationale.
- Eligible Contracts: eligibility, rejection reason, volume, OI, value and spec fields.
- Backtest: metrics, trades, train/test and walk-forward if available.

### Aayush S. Kushwaha
- Verify DTO semantics and strategy assumptions.
- Check chronological splits and look-ahead leakage.
- Confirm `is_valid_backtest` threshold and `metrics.status`.
- Make cost assumptions explicit; do not claim net returns without configured costs.

### Araham Jain
- Finish route validation, error translation and data-quality reporting.
- Add route tests with the supplied JSON fixture and a real quant run.
- Keep HTTP schema in sync with docs.

**Day 2 exit:** a single real report renders from API to UI, including no-trade and null-metric cases.

## Day 3 — Polish, verify and demo

### Aayush Thakre
- Polish chart hierarchy, labels, units, table density and responsive layout.
- Test normal, empty, error and diagnostics-only states.
- Run production build; deploy and verify the deployed URL.
- Prepare local fallback demo.

### Aayush S. Kushwaha
- Validate strategy metrics against underlying calculations.
- Verify costs, exit assumptions, holding periods, expiry/roll behavior and test split.
- Document known quantitative limitations.

### Araham Jain
- Verify clean import and reproducible source-data load.
- Test route behavior for missing files, invalid schema and insufficient history.
- Document environment and startup commands.

## Files and their purpose

| File | Why it exists |
|---|---|
| `README.md` | Project overview, setup and operating rules |
| `SKILLS.md` | Mandatory frontend quality and anti-slop constraints |
| `docs/IMPLEMENTATION_PLAN.md` | This phased plan and ownership |
| `docs/API_CONTRACT.md` | HTTP routes wrapping the Python quant boundary |
| `docs/DATA_SCHEMA.md` | Required quant frame columns and output DTO fields |
| `docs/METHODOLOGY.md` | Spread/z-score/backtest semantics to verify |
| `docs/DESIGN_SYSTEM.md` | Visual direction and chart/component standards |
| `reference/quant/api.py` | Original quant integration module provided by Kushwaha |
| `reference/samples/api_contract_sample.json` | Original serialized report sample |
| `frontend/src/types/api.ts` | Frontend DTO interfaces |
| `frontend/src/lib/api.ts` | Centralized HTTP client |
| `frontend/src/components/` | Shared layout, chart, state and table components |
| `frontend/src/pages/` | Overview, Pair Explorer, Signal Forensics, Backtest, Eligible Contracts, Data Quality |
| `backend/app/main.py` | FastAPI app and route registration |
| `backend/app/routes/quant.py` | HTTP route wrappers for quant functions |
| `tests/` | Quant, route and UI integration tests |
| `prompts/FRONTEND_AGENT.md` | Agent instructions for frontend work |
| `prompts/INTEGRATION_AGENT.md` | Agent instructions for integration/review |
| `prompts/DAILY_HANDOFF.md` | Daily status and handoff format |

## Proposed frontend structure

```text
frontend/src/
├── app/App.tsx
├── components/
│   ├── layout/AppShell.tsx
│   ├── layout/PageHeader.tsx
│   ├── data/MetricValue.tsx
│   ├── data/StatusBadge.tsx
│   ├── data/DataQualityNotice.tsx
│   ├── charts/ChartPanel.tsx
│   ├── charts/SpreadChart.tsx
│   ├── charts/ZScoreChart.tsx
│   ├── states/LoadingState.tsx
│   ├── states/EmptyState.tsx
│   └── states/ErrorState.tsx
├── pages/
│   ├── OverviewPage.tsx
│   ├── PairExplorerPage.tsx
│   ├── SignalForensicsPage.tsx
│   ├── BacktestPage.tsx
│   ├── EligibleContractsPage.tsx
│   └── DataQualityPage.tsx
├── lib/api.ts
├── lib/format.ts
├── types/api.ts
└── styles/globals.css
```

## Definition of done

- Routes call Kushwaha's quant boundary rather than reimplementing it.
- Actual response shape matches the docs and TypeScript types.
- Sample report displays one-day diagnostics and invalid-backtest warning correctly.
- Costs-null metrics remain unavailable; no fake net P&L.
- Every chart has units, legend and date context.
- Tests/build run and results are reported accurately.
