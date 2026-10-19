# GoldLens Frontend

React 18 + Vite 5 + TypeScript 5.6 + Tailwind CSS 3 (config in `tailwind.config.ts`,
tokens further described in `docs/DESIGN_SYSTEM.md`) + Recharts 2 + lucide-react +
Vitest/RTL for tests. A quiet dark editorial-finance research terminal for
relative-value research on MCX gold futures calendar spreads.

## Status: pre-backend (fixture mode is the default)

No GoldLens HTTP backend exists in the repository yet — every route in
`docs/API_CONTRACT.md` v1 is a PROPOSAL (the quant boundary `reference/quant/api.py`
is a Python module, not a server). The app therefore ships with two explicit data
modes:

- **fixture** (default): the bundled one-day diagnostic sample
  (`src/lib/api/fixtures/api_contract_sample.json`), parsed through the same strict
  runtime validator as live responses, and permanently labeled in the UI.
- **live**: real backend calls only. Failures render as honest error states;
  there is no silent fallback to the fixture.

No invented market data, metrics, or endpoints. The supplied sample is 1 trading
day (2026-10-16), 0 trades, costs unconfigured, `is_valid_backtest = false` — and
the UI says exactly that.

## Commands

```bash
cd frontend
npm install
npm run dev        # dev server on http://localhost:5173 (strict port)
npm run typecheck  # tsc both configs
npm run test       # vitest, single run (unit + component tests)
npm run lint       # eslint
npm run build      # typecheck + production build
npm run preview    # serve the production build
```

## Environment

Copy `frontend/.env.example` → `frontend/.env` and adjust. Key variables:
`VITE_DATA_MODE`, `VITE_API_BASE_URL` (live mode only), `VITE_DEFAULT_SYMBOL`,
`VITE_FIXTURE_DELAY_MS`.

## Backend connection

- Set `VITE_DATA_MODE=live` + `VITE_API_BASE_URL`.
- CORS + real routes must come from the backend owner; the working list of open
  items is `docs/INTEGRATION_BLOCKERS.md` (owned by team lead).
- The backend must serialize `BacktestReportDTO.to_json_dict()` boundaries
  verbatim: snake_case fields, `null` for withheld values — never `0`.
- Current proposed live routes: `GET /health`, `GET /report?symbol=GOLDM`,
  `GET /api/v1/data-quality` (all pending — see the contract doc).

## Honesty rules enforced in this codebase

- `null` renders as "not computed"/"Not available" — never as zero.
- `diagnostics_only` / `is_valid_backtest=false` produce unmissable notices with
  the backend verdict shown verbatim.
- Costs unconfigured ⇒ net metrics withheld with the backend's own reason.
- Fixture data is never mixed with live data; the fixture banner stays visible
  whenever the bundled sample is rendered.
