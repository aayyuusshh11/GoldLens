# GoldLens — Team Lead Handoff

**Owner:** Aayush Thakre (frontend + integration + coordination)
**Branch:** `feat/aayush-frontend-integration` (never commit to `main` without approval)
**Last updated:** 2026-10-19
**Source of truth for phases:** `Implementation.txt` (PROMPT 0–12)
**Related docs:** `docs/API_CONTRACT.md` · `docs/DATA_SCHEMA.md` · `docs/INTEGRATION_BLOCKERS.md` · `docs/DESIGN_SYSTEM.md` · `docs/METHODOLOGY.md` · `docs/IMPLEMENTATION_PLAN.md` · `docs/FRONTEND_IMPLEMENTATION.md` · `prompts/DAILY_HANDOFF.md` (daily quick form)

---

## 0. UPDATE PROTOCOL (mandatory — read before any future phase)

This file is the durable memory of the project. At the **end of every phase**, before touching anything else:

1. Update the **Phase status table** (§1) for the phase just completed.
2. Append an entry to the **Change log** (§8) — dated, phase-tagged, with files changed.
3. Re-run the **verification matrix** commands (§2) and write the actual results + timestamp. Never write "passed" without the command output existing first.
4. Update **Blockers / owner handoff** (§4) — any new question for Araham (backend) or Kushwaha (quant) goes in `docs/INTEGRATION_BLOCKERS.md` FIRST, then gets mirrored here by reference.
5. Update **Next action** (§9).
6. If work touched the contract or honesty rules, update `docs/API_CONTRACT.md` / this file's §5 together — no silent drift.

Rule of record: `/reference/quant/api.py` and `api_contract_sample.json` must never be edited — they are the supplied boundary.

---

## 1. Phase status table (PROMPT 0–12)

| # | Phase | Status | Notes / evidence |
|---|---|---|---|
| 0 | Repository reconnaissance | ✅ DONE | Full tree audit; collision of two parallel implementations detected and resolved; decisions confirmed with team lead; **choice: adopted the parallel (features/*) implementation as canonical base**, first implementation quarantined in `frontend/.audit/` (29 files + manifest, restorable). |
| 1 | Freeze frontend/backend contract | ✅ DONE (with open decision) | `docs/` contract set exists; confirmed-vs-proposed separated. **Open:** route-set discrepancy recorded in `docs/INTEGRATION_BLOCKERS.md` §4 — adopted draft uses `GET /health`, `GET /report?symbol=…`, `GET /api/v1/data-quality`; original prompt proposed 7 different routes. Araham must pick one. |
| 2 | Frontend foundation & routing | ✅ DONE | App shell + sidebar/topnav, 6 routes (`/`, `/pair`, `/signals`, `/backtest`, `/contracts`, `/data-quality`), design tokens (dark graphite + gold per `docs/DESIGN_SYSTEM.md`), honest config screen for missing env. Verified by typecheck + build + component tests. |
| 3 | Typed API client & report adapter | ✅ DONE | `src/lib/api/{client,errors,config,parse,report,fixtures}.ts`; runtime validator (`parse.ts`) rejects contract drift with named paths; `null` never coerced; fixture loads through the same validator; abort/timeout preserved. |
| 4 | Overview page | ✅ DONE | Verbatim verdict + provenance + eligibility snapshot + "Where to look next" links; tested (`features/overview/OverviewPage.test.tsx`). |
| 5 | Pair Explorer | ✅ DONE | Near/far chart + spread series + observation log w/ stale badges; gap pass added the spread-semantics honesty notice (see §8, 2026-10-19). |
| 6 | Signal Forensics | ✅ DONE | Decision panel, per-row expandable forensics log, verbatim rationale/no-trade/filter reasons, config chips, z-series chart wired (renders only when ≥2 computed z rows). |
| 7 | Backtest page & honest metrics | ✅ DONE | Validity badge + `InvalidReportNotice`, full/train/test metrics with gross-vs-net + withheld-costs handling, trades table (empty state explicit), walk-forward generic table with "meanings pending" notice; full run-config chips added. **Run-Backtest form intentionally absent** — POST route unconfirmed (mandate: only when confirmed). |
| 8 | Data Quality page | ✅ DONE | Provenance + spec checks verbatim (absent ≠ "all passed"), proposed-route probe degraded gracefully, methodology notes restored+integrated; **Eligible Contracts page** covers the 168-row registry: search / eligible-only / verified-only / sort / 40-row soft pagination, reason-token legend (only tokens present in data, glosses marked "observed, pending owner confirmation"). |
| 9 | Integration with backend + quant | 🚫 BLOCKED | No FastAPI backend exists; `reference/quant/api.py` is byte-identical to root `api.py` (the internal `config/contracts/data/engine/…` package is still missing). Live mode degrades into explicit error states by design. Blocker owner: Araham Jain (+ route-set decision, CORS). Frontend-side integration notes: `docs/INTEGRATION_BLOCKERS.md` §1–§4. |
| 10 | Testing, accessibility, failure states | 🟡 PARTIAL | Achieved: 69/69 tests (unit + component incl. RTL), typecheck clean, eslint 0 errors/6 warnings, failure paths tested (schema drift, live-mode errors, fixture rejection for GOLD, cancellation). **Outstanding:** dedicated a11y pass (focus order, chart alternates, mobile viewport sweep), long-string + huge-array edge sweep, reduced-motion verification. |
| 11 | Demo mode, docs, presentation flow | 🟡 PARTIAL | Achieved: frontend README (stack/commands/env/honesty rules), `.env.example` (frontend+root), fixture labeling rules all verified in code. **Outstanding:** 3–5 min demo walkthrough script, README troubleshooting section, checking repo for secrets/large artifacts. |
| 12 | Final review & handoff | ⬜ NOT STARTED | Awaits P9–P11 completion. |

**Count: 9 of 13 phases done / verified. 1 blocked (P9) · 2 partial (P10, P11) · 1 not started (P12).**

---

## 2. Verification matrix (latest actual run: 2026-10-19, 20:12)

| Command | Result | Notes |
|---|---|---|
| `cd frontend && npm install` | 226 packages clean (esbuild postinstall approved via `npm approve-scripts esbuild`) | lockfile for adopted stack |
| `npm run typecheck` | ✅ clean | `tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.node.json --noEmit` |
| `npm run test` | ✅ **69 passed / 69** (10 test files) | unit + component (RTL/jest-dom); includes fixture/parse/collision-repair tests |
| `npm run lint` | ✅ 0 errors · ⚠ 6 warnings | all react-refresh/only-export-components (dev-mode hint, non-blocking) |
| `npm run build` | ✅ built | dist chunks: index ~133 kB / vendor ~244 kB / charts ~313 kB (gzip ≈ 29/81/81 kB) |
| `npm run preview` | ✅ serves 200 (does NOT prove visual rendering — see §7) | smoke check only |

Re-run this table every phase and update the timestamp.

---

## 3. Architecture & file ownership map (adopted base)

```text
frontend/
├─ src/
│  ├─ main.tsx                     entry: mounts app/App, global styles
│  ├─ app/
│  │  ├─ App.tsx                   routes + config-error screen (6 pages)
│  │  └─ ReportContext.tsx         data layer: cache / generation guard / abort /
│  │                               refresh-with-stale-keeping / health pill / source.mode
│  ├─ types/api.ts                 DTOs — snake_case 1:1 with quant boundary
│  ├─ lib/
│  │  ├─ api/{client,errors,config,parse,report,fixtures}.ts
│  │  │                            transport · error envelope · runtime DTO validator ·
│  │  │                            proposed endpoints · fixture loader (same validator)
│  │  ├─ reportAnalysis.ts         count/label-only helpers (no recomputation)
│  │  ├─ formatters/format.ts      en-IN money/price/lots, plain-date parsing (no TZ drift)
│  │  └─ charts/chartColors.ts     restrained series palette
│  ├─ components/
│  │  ├─ layout/                   AppShell, SidebarNav, Badges, PageHeader, ConfigChips,
│  │  │                            DataModePill, FixtureBanner (+ tests)
│  │  ├─ primitives/               SectionPanel, DataNotice, ReasonList, MetricValue
│  │  ├─ states/                   LoadingState, ErrorState, EmptyState
│  │  └─ charts/                   SpreadChart, ZScoreChart (wired in signals),
│  │                               ChartPanel, ChartTooltips
│  ├─ features/                    one folder per screen (overview, pair, signals,
│  │                               backtest, contracts, data-quality) + tests
│  └─ test/                        setup.ts (jest-dom), helpers.ts (fixture via validator)
├─ .env.example                    VITE_DATA_MODE / VITE_API_BASE_URL / VITE_DEFAULT_SYMBOL / VITE_FIXTURE_DELAY_MS
└─ .audit/                         QUARANTINE of first implementation (29 files, MANIFEST.md) — NOT built
```

**Perm rules for future sessions:** don't edit teammates' concepts without handoff (`docs/INTEGRATION_BLOCKERS.md`); never rename DTO fields; never delete `reference/`; `frontend/.audit/` is user-owned pending a delete decision.

---

## 4. Blocker & owner summary (mirror of `docs/INTEGRATION_BLOCKERS.md`)

### For Araham Jain (backend)
1. **Route-set decision** (§4 of blockers): pick the canonical endpoints (adopted 3-route draft vs original 7-route list, or reconciled superset) — blocks all "live mode" work.
2. **Missing quant package**: `api.py` imports `config, contracts, data, engine, metrics, selection, spreads, zscore, run_quant` — none shipped. Where does it live; how should backend execute it?
3. **CORS**: allow `http://localhost:5173` (strict port) for dev.
4. **Backend wrapper** must serialize `to_json_dict()` verbatim; translate `QuantAPIError.to_json()` into HTTP errors preserving `{error_code, message, details}`.
5. `/api/v1/data-quality` response DTO to be agreed when route ships.

### For Aayush S. Kushwaha (quant)
1. **Spread sign convention** (sample ⇒ far − near) — confirm.
2. **`win_rate` / `sharpe_ratio` scale** (fraction vs percent; annualization) — confirm; UI renders unit-less until then.
3. **`walk_forward_cmp` inner keys** — document schema.
4. **`quote_basis_g` semantics** — unknown; rendered verbatim only.
5. **Stale-row definition + pair rolling expiry behavior** — confirm.
6. **`holding_days` basis** (calendar vs trading days) — confirm for table labels.
7. **Costs configuration path** (config field? manifest?) — net metrics stay withheld until then.

### For team lead (self/Aayush Thakre)
- Quarantine decision: delete `frontend/.audit/` or keep for reference (user said *keep for now*).
- Mirror every new contract question into docs first, then this file.

---

## 5. Honesty rules (non-negotiable — enforced in code + tests)

1. `null` renders "not computed" / "Not available" / "—". **Never zero.**
2. `is_valid_backtest=false` or `metrics.status=diagnostics_only` ⇒ unmissable notice quoting the backend `verdict` verbatim; metrics framed as diagnostics, never performance.
3. Costs unconfigured ⇒ net P&L / net Sharpe / net drawdown withheld, backend `metrics.notes` shown verbatim.
4. Fixture (sample) data is permanently labeled and can never mix with live data; live failures never fall back to fixtures.
5. Rejections stay visible by default; filters are explicit user actions.
6. The frontend recomputes nothing — only count / label / format.
7. Charts: gaps stay gaps (no interpolation), thresholds only from `report.config`, labels/units always shown.
8. Sample = 1 trading day (2026-10-16), 0 trades, costs not configured, `is_valid_backtest=false`. Every demo must begin by saying this.

---

## 6. Environment & runbook (quickstart for any teammate)

```bash
# backend/quant
#   — none runnable yet (see blockers); reference files supplied

# frontend
cd frontend
npm install          # approve esbuild script if npm asks: npm approve-scripts esbuild
npm run dev          # http://localhost:5173 (strict port), fixture mode default
npm run typecheck && npm run test && npm run lint && npm run build
```

Env: copy `frontend/.env.example` → `frontend/.env`. `VITE_DATA_MODE=live` turns the app real — do not enable without the backend existing.

---

## 7. Verification honesty

What has NOT been done and must not be claimed: browser-based visual verification (no browser tooling in this environment), real end-to-end backend round-trip (none exists), a11y automation sweep. Whenever something is verified, §2 gets the command + actual output.

---

## 8. Change log (append every phase)

### 2026-10-19 — Collision resolution + Phases 2–8 verified on adopted base
- Detected a second parallel implementation stream; overwrites vs our first scaffold resolved per team-lead decision: **adopted the features/* architecture**.
- First implementation preserved in `frontend/.audit/` (29 files + `MANIFEST.md`), nothing deleted.
- De-shadowed test infra: stray `vitest.config.ts` moved to `.audit/` (it silenced jest-dom setup + RTL auto-cleanup); vite config got `include: src/**/*.test.{ts,tsx}` so quarantined tests are never collected.
- Restored shared `ReasonList` (adopted base imports it); quarantined orphaned `lib/utils.ts`.
- Dependencies installed for adopted stack (React 18 / RR6 / Recharts 2 / Tailwind 3 / Vite 5 / Vitest 2 + RTL).
- Gap pass vs PROMPT 4–8 (files changed): `components/layout/ConfigChips.tsx` (new; reused by Backtest + Signals), `features/backtest/BacktestPage.tsx`, `features/signals/SignalForensicsPage.tsx` (+ ZScoreChart wiring), `features/pair/PairExplorerPage.tsx` (spread.notice), `features/backtest/WalkForwardTable.tsx` (notice fix), `features/contracts/ReasonTokenLegend.tsx` + page wiring, `frontend/README.md`, `frontend/.env.example`, root `docs/INTEGRATION_BLOCKERS.md` (§4 route decision + §5 gap-pass record).
- New tests: `ConfigChips.test.tsx`, `ReasonTokenLegend.test.tsx`.
- Verified: typecheck clean · 69/69 tests · eslint 0 errors/6 warnings · production build ✓.

### 2026-10-19 — First implementation (superseded, quarantined)
- docs/ v0 draft set + `frontend/` scaffold (React 19/RR7/Tailwind 4), typed client + 24 unit tests, data-backed Overview, light editorial theme. Superseded by team decision; code retained in `.audit/mine/`.

---

## 9. Next action

1. **Team lead:** commit the verified state on `feat/aayush-frontend-integration` (staged reviewed files; never `main`), then take `docs/INTEGRATION_BLOCKERS.md` §4 (route set) to Araham.
2. **Backend owner:** decision + FastAPI wrapper around the boundary functions (INTEGRATION_AGENT.md prompt already specifies the approach).
3. **When a decision lands:** resume P9 integration wiring; then P10 (a11y + edge sweep) → P11 (demo script + troubleshooting) → P12 (final review, full diff walk, handoff report per PROMPT 12 format).

*Update this file at the end of every phase. If this file's timestamp is older than the newest verification run, the handoff is stale — fix that before coding.*
