# GoldLens — Arhm Jain Handoff (Implementation)

**Owner:** Araham (Arhm) Jain — data engineering, contract registry, FastAPI, storage
**Date:** 2026-10-20 · **All phases (0–7) of `IMPLEMENTATION_PHASES_ARHM.txt` executed.**
Supersedes the root `HANDOFF_ARHM.md` planning note (kept for continuity). Everything
below describes code that actually exists and tests that were actually run.

---

## 1. What is implemented

| Phase | Deliverable | Where |
|---|---|---|
| 0 | Data audit of the supplied CSV (measured, not asserted) | `docs/DATA_AUDIT.md` |
| 1 | Shared schemas + API contract | `docs/DATA_SCHEMA.md`, `docs/API_CONTRACT.md` |
| 2 | Validated CSV ingestion (dates, symbols, numerics, nulls, flags, provenance) | `backend/app/services/ingest.py` |
| 3 | DuckDB storage + provenance-aware contract registry (idempotent) | `backend/app/storage/database.py` |
| 4 | Data-quality service + endpoint | `backend/app/services/data_quality.py`, `backend/app/api/routers/data_quality.py` |
| 5 | Full FastAPI endpoint set (thin routes, Pydantic models) | `backend/app/main.py`, `backend/app/api/routers/*` |
| 6 | Edge-case hardening + 45 passing tests | `backend/tests/*` |
| 7 | This handoff | `docs/HANDOFF_ARHM.md` |

Quant formulas are **not** implemented here (quant-owned): the backend exposes
`backend/app/services/quant_interface.py` — a clean integration hook. Until the
quant service is wired, signal/backtest endpoints return the documented
structured **NO_TRADE / refused** outcome; nothing is fabricated.

The teammate files `api.py` and `api_contract_sample.json` (quant boundary
reference) were **not modified**.

## 2. Commands actually run and results (2026-10-20)

```powershell
cd OneDrive\Desktop\Goldlens\backend
python -m pytest tests -q          # 45 passed, 1 warning in 22.51s
python -m compileall -q app tests  # clean (exit 0)
python -m app.cli ingest --store
# -> run_id=ing_20261020T094342Z-878533 observations_inserted=0 observations_skipped=15535
#    (second run of the same file — proves idempotency; first run inserted 15535,
#     contracts_inserted=233, db=data/processed/goldlens.duckdb)
python -m uvicorn app.main:app --port 8124   # live boot verified
```

Live API spot-checks (real ingested data, one trade date):
- `GET /api/health` → `{"status":"healthy","data_available":true,"distinct_trade_dates":1,"latest_data_date":"2026-10-16"}`
- `GET /api/contracts?limit=2` → `total:233`, all specs `null` + `unverified`
- `GET /api/pairs?symbol=GOLDM` → `GOLDM_near20261204_far20270105` `candidate_only` `["UNVERIFIED_SPEC"]`
- `POST /api/backtests/run` → `runnable:false`, `observation_count:1`, nulls, `INSUFFICIENT_HISTORY`

## 3. How to run locally (exact)

```powershell
# prerequisites: Python 3.13+, then once:
pip install -r backend\requirements.txt        # fastapi, uvicorn, pydantic, duckdb, pytest, httpx

# ingest + validate + persist the supplied CSV (idempotent, source untouched):
cd backend
python -m app.cli ingest --store               # add --json for machine-readable output

# run the API:
python -m uvicorn app.main:app --port 8000     # OpenAPI at http://127.0.0.1:8000/openapi.json

# run tests:
python -m pytest tests -q
```

Database: `data/processed/goldlens.duckdb` (rebuildable: delete it and re-run
`ingest --store`; content is byte-for-byte reproducible from the input CSV —
tested). Local artifacts are git-excluded via `data/.gitignore`.

## 4. Stable API surface for the frontend (Aayush Thakre)

Field names below are **stable**; everything else may evolve until v0.2. Full
details: `docs/API_CONTRACT.md`. Error shape everywhere:
`{"error":{"code","message","details"}}` (HTTP 400/404/422/503).

| Route | Key stable fields |
|---|---|
| `GET /api/health` | `status`, `data_available`, `distinct_trade_dates`, `latest_data_date` |
| `GET /api/contracts?[symbol][limit][offset]` | `contracts[].{contract_id, symbol, expiry_date, verification_status, contract_size(=null until verified), verified_fields}` |
| `GET /api/pairs?[symbol]` | `pairs[].{pair_id, symbol, near/far{contract_id, expiry_date}, status, reason_codes, history_days}` |
| `GET /api/pairs/{pair_id}/history?[start][end]` | `observations[].{trade_date, near_close, far_close, spread, status, reason_codes}`, `warnings[]` |
| `POST /api/signals/analyze` | `pair_id, as_of_date, decision, reason_codes, spread, z_score(null), gross_edge(null), estimated_cost(null), net_edge(null), data_quality{distinct_trade_dates, trading_days_available, warnings}` |
| `POST /api/backtests/run` | `run_id, pair_id, strategy_version, evaluation_period{start_date,end_date}, observation_count, completed_trades, gross_pnl(null), estimated_costs(null), net_pnl(null), max_drawdown(null), warnings, runnable (false now)` |
| `GET /api/data-quality` | `sources[], rows{total,futcom_rows,options_rows,...}, issues[]{code,severity,count,message}, contract_spec_verification{verified,unverified,conflicting}, history_sufficiency{distinct_trade_dates, sufficient_for_signal, sufficient_for_backtest}` |
| `POST /api/ingest` | `ingestion_id, accepted_rows, rejected_rows, warned_rows, warnings` |

Display rules the UI must respect (research-integrity requirements):
- `decision:"NO_TRADE"` with `reason_codes` (e.g. `INSUFFICIENT_HISTORY`, `UNVERIFIED_SPEC`) must be shown explainably — never hide it.
- `z_score`/edge/cost fields are `null` by design until the quant service is wired; do not render fabricated numbers.
Zero volume ≠ missing volume (`ZERO_VOLUME_ROWS` vs `MISSING_VOLUME_ROWS` issues; `STALE_PRICE` flags reference closes on zero-volume rows).
- Zero-volume closes are reference values, not tradable quotes (`status:"reference_only"` in pair history).
- Data freshness: `latest_data_date`/`distinct_trade_dates` — currently exactly **one** date (`2026-10-16`); no multi-day history exists.
- `pair_id` format: `SYMBOL_nearYYYYMMDD_farYYYYMMDD` (e.g. `GOLDM_near20261204_far20270105`).
- Contract spec badges: `unverified` until `verification_status:"verified"` with `source`.

## 5. Integration points + decisions needed from quant (Aayush S. Kushwaha)

The backend deliberately does not implement quant logic. Integration options:

1. **Wired service** (preferred): set `GOLDLENS_QUANT_PACKAGE=<importable package>` exposing
   `get_quant_service()` returning an object with:
   - `analyze_signal(pair_id, as_of_date) -> dict` (fields per `SignalAnalyzeResponse`)
   - `run_backtest(pair_id, start_date, end_date, strategy_version) -> dict` (per `BacktestRunResponse`)
   The boundary reference `api.py` in the repo root maps closely to this; its DTOs
   (`SignalDTO`, `MetricsDTO`, `BacktestReportDTO`) can be adapted. `api.py` is a
   *reference copy here*: its relative imports (`.config`, `.contracts`, `.engine`,
   `.metrics`, `.selection`, `.spreads`, `.zscore`, `.run_quant`) resolve only inside
   the quant team's own package, not in this repo. Line 1 carries
   `# pyright: reportMissingImports=false` so IDEs do not flag these 8 expected
   unresolved imports; the file runs unchanged on the quant side.
2. **HTTP service**: wrap the same interface in a tiny FastAPI/HTTP adapter and call it from
   `analyze_signal`/`run_backtest` in `backend/app/services/analytics.py`.

Decisions needed (currently defaulting to `/docs/API_CONTRACT.md` values):
1. `decision` enum wording: `NO_TRADE | BUY_NEAR_SELL_FAR | SELL_NEAR_BUY_FAR` — confirm/rename.
2. Minimum history for signals/backtests: currently 30 distinct dates configured.
3. Pair eligibility rules (liquidity thresholds, expiry gaps) — backend lists `candidate_only`.
4. Spread normalization method and cost model fields (no formula implemented here).
5. Verified specifications seeding: the registry supports
   `GoldlensDB.verify_contract_fields(contract_id, fields, source, effective_from/to)` —
   publish the verified-spec dataset (e.g. from the `YearWise 2026-10-18` report referenced in
   `api_contract_sample.json`) so GOLD/GOLDM specs can be marked `verified` with provenance.
   Until then **all 233 registry contracts are `unverified`** with all spec fields null — by design.

## 6. Changed files (this work)

```text
docs/DATA_AUDIT.md, docs/DATA_SCHEMA.md, docs/API_CONTRACT.md, docs/HANDOFF_ARHM.md (new)
backend/app/{__init__,main,config,cli}.py
backend/app/schemas/{__init__,models,data_quality,api_models}.py
backend/app/services/{__init__,ingest,data_quality,analytics,quant_interface}.py
backend/app/storage/{__init__,database}.py
backend/app/api/__init__.py, backend/app/api/deps.py
backend/app/api/routers/{__init__,health,contracts,pairs,signals,backtests,data_quality,ingest}.py
backend/tests/{__init__,conftest,test_ingest,test_storage,test_data_quality,test_api,test_edge_cases}.py
backend/requirements.txt
data/.gitignore
```

Untouched on purpose: `api.py`, `api_contract_sample.json`, `README.md`,
`HANDOFF_ARHM.md`, `IMPLEMENTATION_PHASES_ARHM.txt`, the CSV.

## 7. Current limitations / known issues

1. **One trading day of data.** Signals/backtests are refused (`runnable:false`,
   `NO_TRADE`+`INSUFFICIENT_HISTORY`) by design. Supply multi-date bhavcopy files; ingest is
   already multi-day-ready (see `test_registry_observed_dates_track_newer_data`).
2. **No verified contract specifications.** Every spec field is null/`unverified` until the
   quant owner supplies authoritative sources (integration point in §5.5).
3. **No settlement prices** — the source has no settlement column (never fabricated).
4. Quant service not wired — signal analytics beyond the raw reference spread are null.
5. Pair candidates are adjacent-expiry only, capped at 200; paging/filters to be refined
   with the frontend.
6. This "repository" actually sits inside a stray git repo rooted at the Windows user
   profile (`origin=https://github.com/Araham07/git-tutorial.git`) — **no commit was made**
   (nothing in `GoldLens/` is tracked). Recommend initializing a dedicated git repo inside
   `GoldLens/` (or moving the folder out and re-initializing) before the first team commit.

## 8. Git/PR instructions (not executed — see limitation 6)

Once the GoldLens folder has its own repo/remote (team decision):

```powershell
cd OneDrive\Desktop\Goldlens
git init -b Araham-jain                          # or your team repo; keep main clean
git add docs backend data\.gitignore README.md
git commit -m "Data backend: validated ingestion, DuckDB registry, data-quality + API (phases 0-7)"
git push -u origin Araham-jain                   # then open PR into main
```

Never commit `data/processed/*` or `data/raw/*` (gitignored already).
Verified branch at execution time: `Araham-jain` of the stray home repo (no commits made;
no commit hash exists for this work yet, by design).
