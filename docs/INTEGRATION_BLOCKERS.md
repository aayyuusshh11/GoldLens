# GoldLens — Integration Blockers & Open Contract Questions

Owner of this list: **Aayush Thakre** (frontend/integration). This tracks
everything the frontend needs from teammates (backend routes: Araham Jain;
quant semantics: Aayush S. Kushwaha). Nothing here blocks the frontend from
running today — fixture mode + explicit error states cover all gaps — but every
item below gates **live mode** or a rendering decision.

## 1. Pending backend HTTP endpoints (contract draft: docs/API_CONTRACT.md)

| Route used by frontend | Status | Frontend behavior meanwhile |
| --- | --- | --- |
| `GET /health` | pending | live mode: header pill shows "API problem" + probe detail; fixture: `fixture` pill |
| `GET /api/v1/report?symbol=GOLDM` | pending | live mode renders the documented error contract as error states; fixture serves the bundled sample |
| `GET /api/v1/data-quality` | pending (proposed) | Data Quality page probes it in live mode only; failure ⇒ inline notice, page falls back to provenance fields in the loaded report |

Required response behavior (already implemented against):
- Non-2xx bodies shaped `{error_code, message, details}` (any layer of that may
  be missing; the client degrades to `http_<status>`).
- `data_quality_rejected` / `invalid_input_schema` / `quant_error` rendered
  verbatim + neutral hint.

## 2. Open contract questions the UI renders around

1. **Spread sign convention.** Sample shows `spread = far − near`
   (149227 − 147866 = +1361). Pair Explorer states "sample sign convention is
   far − near (confirmation pending)". → **Confirm;** UI copy is one string.
2. **`win_rate` / `sharpe_ratio` scale.** Fraction vs percent; annualization
   convention unknown. Metrics render unit-less with a "scale pending quant
   confirmation" note instead of guessing. → **Confirm quant owner.**
3. **`walk_forward_cmp` inner keys.** Undocumented; walk-forward table is
   generic and prints field names verbatim with a "meanings pending" notice.
   → **Document keys** (ideally train/test per-fold metrics + status).
4. **Data-quality response schema.** `data-quality` page renders provenance
   from the report payload; once the route exists, agree the DTO
   (source paths, registry spec table, ingestion coverage).
5. **CORS for dev origin.** Frontend dev server is `http://localhost:5173`
   (strict port). Backend must allow this origin for Authorization-free GET
   endpoints (or use a Vite proxy; `VITE_API_BASE_URL` handles either).
6. **`HealthDTO` shape.** Frontend expects `{status, service, quant_module}`
   (all strings). If the backend shape differs, only `lib/api/parse.ts`
   (`parseHealth`) changes.

## 3. Deliberate frontend decisions teammates should know

- **No fixture fallback in live mode.** Errors are content. Refresh errors keep
  the last good report on screen with a stale-data notice.
- **`null` never becomes 0.** Includes blank `train/test` metrics, missing
  equity rows, `z === null` history.
- **Net metrics hidden while `config.costs` is missing** or matches
  `"not configured"` (case-insensitive) — mirror of the pipeline's own
  withholding (`metrics.notes` rendered verbatim).
- **Eligible/verified filters are never pre-applied** — rejections stay
  visible by default (SKILLS.md forbids silently hiding them).
- **Contracts table renders ≤ 40 rows by default** with explicit "Show all".
- **Frontend recomputes nothing**: only count/label/format/derive presentation
  strings (`lib/reportAnalysis.ts`).

## 4. When backend ships — zero-frontend-change checklist

- Endpoint paths per docs/API_CONTRACT.md (`/health`,
  `/report?symbol=`, optionally `/data-quality`).
- CORS for `http://localhost:5173` (dev) and the deployed origin.
- Errors shaped `{error_code, message, details}`.
- Health 200 body `{status:"ok", service, quant_module}`.
Then: set `VITE_DATA_MODE=live` + `VITE_API_BASE_URL` → run.

---

## 4. Added 2026-10-19 � route-set discrepancy needs a decision (team lead)

Two contract drafts now coexist in this repo:

- docs/API_CONTRACT.md v1 (adopted base): `GET /health`,
  `GET /report?symbol={symbol}`, `GET /api/v1/data-quality`.
- The original implementation prompt (Implementation.txt) proposed:
  `/api/health`, `/api/contracts`, `/api/pairs`, `/api/pairs/{pair_id}/history`,
  `POST /api/signals/analyze`, `POST /api/backtests/run`, `/api/data-quality`.

Neither exists in code, so this is a docs-level decision: Araham Jain must pick
one route set (or a reconciled superset) before the frontend "live" mode is
touched again. The frontend causes no drift meanwhile: fixture mode ignores
routes entirely, and live mode degrades route failures into explicit error
states.

Also recorded: `reference/quant/api.py` is byte-identical to the root
`api.py` handoff file (same SHA-256) � it is a copy, not the missing internal
package (`config/contracts/data/engine/�`). Until those modules or a runnable
backend appear, end-to-end live verification remains blocked (B1/B2 lineage).

## 5. Frontend gap pass � 2026-10-19 (team lead, verified)

Implemented against adopted base: shared `ConfigChips` reused by Backtest + Signal
Forensics (full run-config on both); Pair Explorer spread-semantics notice
(spread ? rupee P&L, not a guaranteed opportunity); ZScoreChart wired into
Signal Forensics only when = 2 computed z rows; walk-forward "meanings pending"
notice shown whenever folds exist (previously keyed on brittle name checks);
reason-token legend derived only from tokens present in data; frontend README +
.env.example rewritten for the adopted stack. Verified: typecheck clean,
69/69 tests, production build, eslint 0 errors / 6 minor fast-refresh warnings.

---

## 6. Resolution — 2026-10-20, integrated on `final`

1. **Route set: settled.** The backend's implemented task-sliced routes won
   (docs/API_CONTRACT.md backend-branch version, §1–§8). The frontend data
   layer was migrated P9-style: `lib/api/endpoints.ts` targets exactly
   `GET /api/health`, `GET /api/contracts`, `GET /api/pairs`,
   `GET /api/pairs/{pair_id}/history`, `POST /api/signals/analyze`,
   `POST /api/backtests/run`, `GET /api/data-quality`. The old single
   mega-report client (`GET /api/v1/report`) and its quant-boundary DTOs are
   deleted from the app.
2. **Error shape: settled** to the backend's `{error:{code,message,details}}`;
   the frontend client additionally degrades legacy FastAPI `{detail: ...}`
   bodies safely instead of failing.
3. **Spread convention: settled** — the settled API's spread column is
   `far_close − near_close` (backend code and quant engine agree); UI copy
   renders the convention verbatim. The old quant-boundary sample keeps its own
   values and is a reference artifact only.
4. **Quant wiring: settled** — `GOLDLENS_QUANT_PACKAGE=quant.service_adapter`
   (see `backend/.env.example`; run uvicorn from `backend/` with
   `PYTHONPATH=..`). Until wired — or when history is insufficient —
   signals/backtests remain honest NO_TRADE / runnable:false.
5. **Z-score history is not an API response shape** — Signal Forensics renders
   the single decision + reason codes (z stays null until the quant service is
   wired). The old z-series page section is removed rather than faked.
6. **Contract-registry view replaces "eligible contracts"** while specs are
   unverified: verification-first listing with ≤40 rows default and an explicit
   "Show all" toggle; nothing is silently hidden.
