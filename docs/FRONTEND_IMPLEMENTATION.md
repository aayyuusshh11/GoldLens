# GoldLens Frontend Implementation

Owner: **Aayush Thakre** (frontend, UX, API client, integration lead).
Status: implemented, verified, committed on `feature/frontend-shell`.
Scope: frontend only — quant methodology (`reference/quant/api.py`) and
backend HTTP routes are teammates' work; this document records exactly what the
frontend does and does not assume.

## 1. Stack (as pinned in `frontend/package.json`)

| Concern | Choice |
| --- | --- |
| UI | React 18.3 + TypeScript ~5.6.3 (strict, `noUncheckedIndexedAccess`, `no-explicit-any` as ESLint error) |
| Build | Vite 5.4 (manual chunks: `charts`, `vendor`) |
| Styling | Tailwind 3.4 with the DESIGN_SYSTEM.md token palette only (`#0B0D10 #12161B #191F26 #2A313A #F3F4F6 #9CA3AF #C7A45B #35B887 #E16D72 #E5B45B`) |
| Charts | Recharts 2.13 — animations disabled, thresholds from `report.config` |
| Routing | react-router-dom 6.28 (6 ReportGate routes + 404) |
| Testing | Vitest 2.1 (jsdom, globals) + Testing Library 16 + user-event 14 |
| Icons/font | lucide-react 0.447, @fontsource-variable/inter (tabular numerals via `font-mono tabular`) |

## 2. Six screens (per SKILLS.md information architecture)

1. **Overview** — verdict headline (`is_valid_backtest` badge + `verdict`
   verbatim), provenance summary, metrics availability, costs-withheld notice,
   links into deep-dives.
2. **Pair Explorer** — near/far expiry legs, pipeline-selected pair identity,
   rejections counts, near-vs-far and spread-series charts, observation log with
   stale flags.
3. **Signal Forensics** — latest-session decision panel (signal, z, spread,
   filters, rationale, no-trade reasons), strategy-config chips, expandable
   per-date log. `z === null` renders "not computed", never 0.
4. **Backtest** — `InvalidReportNotice` above everything; full/train/test
   metrics blocks where withheld net metrics render the reason instead of a
   number; trades table (pending exits labeled); generic walk-forward table.
5. **Eligible Contracts** — registry with search, `Eligible only` /
   `Verified spec only` filters, sortable columns (`aria-sort`), 40-row default
   budget + explicit "Show all". Rejections are visible by default.
6. **Data Quality** — provenance from the loaded report, spec-check
   pass/fail list, data rules, required-frame columns, methodology reference
   (`MethodologyNotes`). A proposed `/data-quality` backend route is probed in
   live mode only; failure degrades to an inline notice (page stays useful).

## 3. Data layer semantics

- **No recomputation rule**: only counting/labeling/formatting above the
  pipeline's own numbers. No spread/z/P&L math anywhere in the UI code.
- **Runtime validation** (`lib/api/parse.ts`): `unknown → DTO` strict parser.
  Contract drift raises `ApiRequestError(kind:"schema")` naming the exact path
  (e.g. `Contract mismatch at "report.metrics.net_pnl_rupees": number or null`).
  Extra keys ignored (forward compatible).
- **Error normalization** (`lib/api/errors.ts`): network / timeout / http /
  schema / unknown; HTTP bodies honor the API contract
  `{error_code, message, details}`; `quant_error`, `invalid_input_schema`,
  `data_quality_rejected` get neutral hints (`quantErrorHint`).
- **ReportContext** (provider): per-symbol in-memory cache, `AbortController`
  per load, generation counter so stale responses can't land, user-initiated
  `refresh()` bypasses cache while keeping the last good report visible
  (`ready + refreshing`), failures surface as `error` entries with optional
  cached/stale report. Health probe (live mode only) drives the header pill and
  never gates rendering.
- **ReportGate** (`app/App.tsx`): loading → skeletons; error w/o cache →
  ErrorState + retry; error w/ cache → transparent "stale data" notice + last
  good report; ready → page.
- **Fixture mode**: only via `VITE_DATA_MODE` (unset ⇒ fixture). The sample
  passes through the SAME strict parser as live responses. Non-GOLDM requests
  mirror the backend's `data_quality_rejected` (409). Always labeled (pill,
  banner, footer). Live mode never has fixture fallback.

## 4. Honest-data behaviors (requirement source: root README + SKILLS.md)

| Rule | Implementation |
| --- | --- |
| null ≠ 0 | `MetricValue` renders "Not computed/Unavailable/Withheld…"; type system keeps nulls distinct |
| Net withheld w/o costs | `costsNotConfigured(report)` checks `config.costs` null/empty/`"not configured …"`; `netWithheldReason` picks the explanation |
| `verdict`/`is_valid_backtest` prominent | Overview headline block, Backtest `InvalidReportNotice`, ValidityBadge in PageHeader actions |
| Diagnostics-only labeling | `MetricsStatusBadge` (warn) + status line on every metrics block |
| Fixture always labeled | `FixtureBanner`, `DataModePill`, footer source line |
| No fake live data | No interpolation of missing sessions; single-point series stay single points; gap/step explanations in chart footers |
| Rejections visible | Contracts table shows eligible+rejected by default; filters are explicit user actions |
| Walk-forward keys undocumented | Generic verbatim table + pending-confirmation notice |

## 5. Verification record (commands actually executed)

| Command | Result |
| --- | --- |
| `npm run typecheck` (tsc -p app && -p node) | ✅ 0 errors (strict) |
| `npm run lint` (eslint .) | ✅ 0 errors, 5 fast-refresh warnings (context/constants files — intentional, see frontend/README) |
| `npm test` (vitest run) | ✅ 74 passed / 74, 9 files |
| `npm run build` (typecheck + vite build) | ✅ built (2411 modules, ~9s, charts+vendor chunks) |
| `npx vite preview` + HTTP fetch of `/` | ✅ 200, index.html serves with GoldLens markup |

Corrupted-`node_modules` incident during install (interrupted npm process left
`@babel/runtime` without `package.json`, breaking `vite build` via
`react-transition-group`) was fixed by a targeted `npm install --no-save
@babel/runtime` re-extract.

## 6. Config & env

`frontend/.env.example` documents `VITE_DATA_MODE`, `VITE_API_BASE_URL`,
`VITE_DEFAULT_SYMBOL`, `VITE_FIXTURE_DELAY_MS`. Root `.env.example` now carries
both backend keys and the frontend block. `VITE_DATA_MODE=live` without
`VITE_API_BASE_URL` throws `ConfigError` at startup → dedicated config error
screen (never a silent fixture downgrade).

## 7. Integration with teammates' work

See `docs/INTEGRATION_BLOCKERS.md` for the pending-endpoint list and open
contract questions (spread sign, win_rate/sharpe scale, walk-forward keys,
data-quality schema, CORS). The client paths already match the draft contract
so backend shipping unblocks live mode with zero frontend changes.
