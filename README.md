# GoldLens — Team Handoff

**Expiry-aware, cost-aware research for MCX gold futures calendar spreads.**

This handoff has been updated to incorporate Aayush S. Kushwaha's actual quant integration boundary (`api.py`) and sample serialized report (`api_contract_sample.json`). Those files are preserved under `reference/`. The quant API is a Python module boundary, not a ready-made HTTP API; the web backend still needs to expose routes around it.

## Team responsibilities

- **Aayush Thakre:** frontend, UX, API client, integration coordination and deployment.
- **Aayush S. Kushwaha:** quant methodology, strategy, signal generation and backtesting.
- **Araham Jain:** data ingestion, contract registry, backend routes and persistence.

## Important finding from the supplied sample

The sample report has **1 trading day**, **1 spread observation**, **no trades**, no configured costs, and `is_valid_backtest: false`. Its verdict explicitly says it is not a valid backtest. Treat it as a contract/shape example and diagnostic output, not proof of strategy performance. The sample's spec-check strings report passes for GOLD and GOLDM, but those strings alone do not replace reviewing the source specification and cross-check method.

## Stack proposal

- Frontend: React + Vite + TypeScript, Tailwind CSS, shadcn/ui, Recharts, Lucide.
- HTTP backend: Python + FastAPI + Pydantic.
- Quant layer: use the supplied Python boundary and its DTOs; do not duplicate its calculations in the frontend.
- Data: pandas; DuckDB or a documented existing storage choice.
- Tests: pytest for backend/quant and frontend build/component tests.

## Repository layout

```text
goldlens/
├── README.md
├── SKILLS.md
├── .env.example
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   ├── API_CONTRACT.md
│   ├── DATA_SCHEMA.md
│   ├── METHODOLOGY.md
│   └── DESIGN_SYSTEM.md
├── frontend/
├── backend/
├── quant/                 # existing quant package; preserve module structure
├── data/
│   ├── raw/                # local/licensed data, do not commit by default
│   └── fixtures/
├── tests/
├── prompts/
└── reference/
    ├── quant/api.py
    └── samples/api_contract_sample.json
```

## Setup

Exact package commands depend on the repository that contains the existing quant package. Do not move `api.py` out of its Python package without adjusting its relative imports (`.config`, `.contracts`, `.data`, etc.).

Typical backend command once `backend/app/main.py` exists:

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Typical frontend command once scaffolded:

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 — runs in fixture mode by default
```

The frontend is now implemented — see `frontend/README.md` for the full setup
and `docs/FRONTEND_IMPLEMENTATION.md` for architecture and verification
records. It runs today against the bundled diagnostic sample (fixture mode)
and against the future backend in live mode (`VITE_DATA_MODE=live` +
`VITE_API_BASE_URL`), with no silent fallback between the two.

## Non-negotiable data rules

- Do not replace missing values with zero unless the calculation explicitly defines that behavior.
- Preserve data provenance and source paths.
- Do not imply a valid backtest when `is_valid_backtest` is false.
- Respect `metrics.status`, `metrics.notes`, `metrics.costs_assumption`, `verdict` and `data_provenance`.
- Never claim net performance when costs are not configured; the sample's `net_pnl_rupees` is null for this reason.
- Do not invent current/live data or turn the sample JSON into fake live output.
- Do not calculate spreads, z-scores or signals again in React. Render the quant API results.
- Treat the API sample as a schema fixture only. Its date and values are example output, not a current market feed.

## Definition of done

- Clean setup and run commands are documented.
- The frontend consumes the real HTTP API, whose routes call the quant boundary.
- The main workflow displays source coverage, pair/spread, z-score, signal rationale, eligible contracts and backtest metrics.
- One-day diagnostics are clearly labeled and never shown as a validated backtest.
- Loading, empty, error, partial-data and diagnostics-only states are implemented.
- All displayed metrics have units and a definition.
