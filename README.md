# GoldLens — MCX Gold Futures Calendar-Spread Research Platform

**Expiry-aware, cost-aware, dishonesty-resistant research for MCX gold futures calendar spreads (`GOLD` 1 kg, `GOLDM` 100 g).**

GoldLens ingests MCX BhavCopy CSVs, builds a provenance-aware contract registry and spread history, and produces spreads / signals / cost-aware backtests through a quant-owned engine — surfaced in a research-grade UI that renders honest *refusals* (NO TRADE, diagnostics-only, runnable:false) exactly like results. With a single day of BhavCopy data, GoldLens deliberately **refuses** to draw z-scores, run backtests or claim performance; supply ≥ 30 distinct trade dates and the gates open automatically.

> **Research integrity rule of this repo:** any number that cannot be traced to a verified source (exchange circular, statute, broker contract note) stays unverified, and every dependent figure (net P&L, z-score metrics) is withheld instead of guessed. An illustrative calculation is never presented as a trading signal.

---

## Repository layout (integrated)

```text
GoldLens/
├── frontend/                 # React + Vite + TS research UI (fixture & live modes)
├── backend/                  # FastAPI + DuckDB pipeline (ingest → registry → routes)
├── quant/                    # Quant engine: spreads, z-score, signals, CTT cost model, backtests
│   └── ingestion/            # file discovery, validation, coverage & readiness audits
├── tests/                    # quant test suite (101+ tests)
├── data/                     # raw CSVs + processed DuckDB (git-ignored, user-managed)
├── docs/                     # API contract, data schema, methodology, cost model, handoffs
└── .github/workflows/ci.yml  # frontend + backend + quant test suites
```

## Team

| Member | Workstream | Branch |
|---|---|---|
| **Aayush Thakre** | Frontend, UX, API client, integration | `main` |
| **Aayush S. Kushwaha** | Quant engine, CTT cost model, backtesting | `Quant` |
| **Araham Jain** | Data ingestion, DuckDB registry, FastAPI backend | `backend` |

All three workstreams are merged on the `final` branch; this file documents the integrated state.

## Quickstart

**One-click (Windows):** `powershell -ExecutionPolicy Bypass -File .\start-dev.ps1` starts the backend (quant wired) and the frontend in live mode as two separate windows. Manually, or for other platforms:

### 0) Prerequisites
- Node 22+, npm
- Python 3.13+, pip
- A MCX BhavCopy CSV dropped at the repo root (`BhavCopyDateWise_<DDMMYYYY>.csv`) — [download from MCX](https://www.mcxindia.com/market-data/bhavcopy). Do **not** commit it (git-ignored).

### 1) Backend — ingest + serve
```powershell
cd backend
python -m venv .venv                      # once
.venv\Scripts\activate                    # PowerShell
pip install -r requirements.txt

python -m app.cli ingest --store          # CSV → validated DuckDB registry (idempotent)
python -m uvicorn app.main:app --port 8000
```
OpenAPI: `http://127.0.0.1:8000/docs`. Tests: `python -m pytest tests -q`.

### 2) Frontend — UI
```powershell
cd frontend
npm install
npm run dev            # http://localhost:5173
```
- **Fixture mode (default):** runs on the bundled 1-trading-day mirror of the real backend — always labeled in the UI.
- **Live mode:** with the backend running on :8000, run another dev session with
  ```powershell
  $env:VITE_DATA_MODE="live"
  npm run dev
  ```
  `VITE_API_BASE_URL` unset ⇒ same-origin via the Vite dev proxy (`/api` → `127.0.0.1:8000`). The app never silently falls back from live to fixture; failures render as explicit error states.
- Tests: `npm test` · Production build: `npm run build`.

### 3) Quant — pipeline (optional standalone)
```powershell
pip install pandas pyarrow pytest
python -m pytest tests -q                 # 101+ engine/cost/integration tests
py -3.13 quant/run_quant.py               # bhavcopy → quant_report.json (diagnostics)
python -m quant.ingestion.generate_reports  # data-quality + backtest-readiness reports
```

### 4) Wire quant into the backend (live analytics)
```powershell
# from backend/, with the repo root one level up:
set PYTHONPATH=..
set GOLDLENS_QUANT_PACKAGE=quant.service_adapter
python -m uvicorn app.main:app --port 8000
```
`quant.service_adapter` implements the exact service contract the backend loads via env (`get_quant_service()` → `analyze_signal` / `run_backtest`). Until it is wired — or when history is insufficient — endpoints return the documented structured refusals rather than fabricated analytics.

## The settled API (7 routes)

| Route | Purpose |
|---|---|
| `GET /api/health` | service + data availability (`distinct_trade_dates`, `latest_data_date`) |
| `GET /api/contracts?symbol=&limit=&offset=` | provenance-aware contract registry (spec fields stay `null` until verified) |
| `GET /api/pairs?symbol=` | near/far calendar-spread candidates (`candidate_only` until verified+eligible) |
| `GET /api/pairs/{pair_id}/history` | spread observations (`observation` vs `reference_only`; spread = **far − near**) |
| `POST /api/signals/analyze` | decision per pair/date (`NO_TRADE` until quant service wired) |
| `POST /api/backtests/run` | cost-aware backtest (refused with `runnable:false` if history insufficient) |
| `GET /api/data-quality` | sources, row accounting, issues, spec verification, history sufficiency |

Errors are shaped `{"error": {"code", "message", "details"}}` (`invalid_input | not_found | data_unavailable | internal_error`). `POST /api/ingest` exists as backend tooling and is deliberately not exposed to the frontend.

## Data status (measured, not assumed)

- Source today: one trading day (`2026-10-16`) — signals, rolling z-scores and backtests are **refused by design** until ≥ 30 distinct dates are ingested.
- Contract specs: all registry entries carry `unverified` status with `null` spec fields until the quant owner supplies authoritative source references.
- Costs: statutory components (CTT, stamp duty, exchange transaction fee + GST, tick size) are **verified with citations** in `docs/COST_MODEL.md`; brokerage and slippage remain unverified, so net P&L is withheld, not estimated.

## Docs index

- `docs/API_CONTRACT.md` — settled routes, shapes, status mapping
- `docs/DATA_SCHEMA.md` — observations, contracts, provenance, registry
- `docs/INTEGRATION_BLOCKERS.md` — integration ledger incl. resolutions on `final`
- `docs/METHODOLOGY.md`, `docs/SPREAD_ENGINE.md` — spread/z-score/signal rules
- `docs/COST_MODEL.md` — per-event cost formula with statutory citations
- `docs/HANDOFF.md`, `docs/HANDOFF_ARHM.md`, `docs/BACKEND_BLOCKER3_HANDOFF.md` — per-workstream handoffs
- `docs/DATA_AUDIT.md`, `docs/DATA_ACQUISITION_CHECKLIST.md`, `docs/HISTORICAL_DATA_INGESTION.md` — data ops

## License

MIT — see [LICENSE](LICENSE).
