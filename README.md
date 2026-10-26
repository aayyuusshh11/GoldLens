# GoldLens — Data Engineering & Backend Starter

**Project:** GoldLens — MCX Gold Futures Relative-Value Intelligence  
**Owner of this workstream:** Araham (Arhm) Jain  
**Role:** Data Engineer, Contract Registry, FastAPI, and Storage  
**Status:** Planning and data audit only; backend implementation has not yet been performed by this document.

## 1. Purpose

GoldLens helps researchers inspect comparable MCX gold futures contracts, calculate relative-value signals, and evaluate them with cost-aware chronological backtests. It must be equally willing to return **NO TRADE** when data is insufficient, specifications are unverified, contracts are illiquid, costs erase the apparent edge, or a valid backtest cannot be run.

This repository must not present an illustrative calculation as a real trading signal or synthetic history as exchange data.

## 2. Team ownership

- **Aayush Thakre — Team lead / frontend / full-stack integration:** React, Vite, TypeScript, Tailwind CSS, shadcn/ui, Recharts, integration and deployment.
- **Aayush S. Kushwaha — Quantitative analyst:** contract comparability and normalization methodology, spread/z-score definitions, signal rules, transaction-cost assumptions, and backtesting logic.
- **Araham Jain — Data engineer / backend:** data ingestion and validation, contract registry, storage, FastAPI/Pydantic endpoints, data-quality reporting, backend tests, and handoff documentation.

## 3. Current data audit

The supplied file was inspected: `BhavCopyDateWise_16102026 (2).csv`.

Observed file facts:
- 15,535 rows and 15 columns.
- One trading date only: `16 Oct 2026`.
- 31 distinct raw symbol strings; symbol values include trailing whitespace.
- Instrument types include `OPTFUT`, `OPTIDX`, `FUTCOM`, and `FUTIDX`.
- 168 rows have `Instrument Name == FUTCOM`.
- No exact duplicate full rows were found in the supplied file.
- `Open`, `High`, and `Low` are missing on 14,592 rows overall. Many option rows have zero volume and a non-null close; these must not be mistaken for executable prices.
- The file includes futures rows for `GOLD`, `GOLDM`, `GOLDTEN`, `GOLDGUINEA`, and `GOLDPETAL`, but a single snapshot cannot support rolling z-scores, chronological walk-forward backtesting, or claims about historical performance.
- Gold futures examples on the file date include GOLD Dec-2026 and Feb-2027 expiries, and GOLDM Nov-2026 through Apr-2027 expiries. These are observed rows, **not verified proof that the contracts are comparable**.
- The volume unit field contains strings such as `5091.000 GRMS`; preserve the raw value and parse quantity/unit separately. Do not assume volume, quotation units, or contract sizes from symbol names.
- `Close` and `Previous Close` are populated even on many zero-volume rows. A populated value alone is not evidence of a tradable observation.

These are descriptive findings from the uploaded file, not verification of MCX contract specifications. Verify current and historical specifications from an authoritative source before marking a contract as eligible.

## 4. MVP scope

Implement one reproducible pipeline:

1. Load a user-provided CSV without changing the original file.
2. Validate required columns, parse dates, normalize symbol whitespace, and preserve raw source fields.
3. Distinguish futures from options and reject unsupported instruments from the gold-futures analytics path.
4. Report missing OHLC values, zero volume/open interest, duplicate business keys, invalid ranges, unparsed units, and unsupported symbols.
5. Store normalized observations and a provenance-aware contract registry in DuckDB (preferred for the prototype) or a similarly lightweight local store.
6. Expose documented FastAPI endpoints.
7. Return a clear data-insufficiency status when historical observations are not sufficient for signal analysis/backtesting.
8. Provide tests and exact run instructions.

## 5. Suggested repository layout

```text
GoldLens/
├── README.md
├── docs/
│   ├── DATA_SCHEMA.md
│   ├── API_CONTRACT.md
│   ├── DATA_AUDIT.md
│   └── HANDOFF_ARHM.md
├── data/
│   ├── raw/                 # user-managed source files; do not commit large/private files
│   └── processed/           # generated local artifacts; normally gitignored
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── storage/
│   │   └── api/
│   ├── tests/
│   └── requirements.txt
├── frontend/
└── .gitignore
```

Inspect the real repository before creating or modifying this structure. Do not overwrite teammates' files.

## 6. Shared data contract

The canonical observation model should map applicable source fields to:

- `trade_date` (date)
- `contract_id` (stable internal identifier)
- `symbol` (trimmed canonical symbol; retain original source symbol separately)
- `expiry_date` (date)
- `open`, `high`, `low`, `close`, `settlement_price` (nullable numeric values; settlement may be unavailable in this file)
- `volume_lots` (nullable numeric)
- `volume_quantity` and `volume_unit` (nullable; parse from source only when reliable)
- `value_lacs` (nullable numeric; preserve source unit)
- `open_interest_lots` (nullable numeric)
- `source_file`, `source_row`, `ingested_at`, and validation metadata.

Do not fill missing values with zero. Zero reported volume is a meaningful observed value; missing volume is a different state.

Contract registry records should include `contract_id`, canonical symbol, instrument type, contract size, quantity unit, quotation unit, purity where applicable, tick size, expiry date/rule, effective-from/effective-to dates, verification status, source/provenance, and verification timestamp. Unknown values must remain unknown.

## 7. API endpoints to coordinate with the team

- `GET /api/health`
- `GET /api/contracts`
- `GET /api/pairs`
- `GET /api/pairs/{pair_id}/history`
- `POST /api/signals/analyze`
- `POST /api/backtests/run`
- `GET /api/data-quality`

Agree exact request/response types with Aayush and Aayush S. Kushwaha in `docs/API_CONTRACT.md` before integration. Signal and backtest endpoints must return explicit warnings or a structured refusal when there is not enough verified history.

## 8. Safety and research integrity

- Never infer contract size, purity, quote units, or eligibility from a symbol alone.
- Never describe one date of data as historical backtest data.
- Never introduce future observations into a signal or backtest decision.
- Do not treat option contracts as gold futures.
- Do not treat zero-volume rows as liquid tradable observations.
- Do not silently repair or discard rows without reporting counts and reasons.
- Keep raw source data immutable and attach provenance to processed records.
- Make `NO TRADE` a first-class, explainable result.

## 9. Definition of done for Arhm's workstream

- CSV ingestion is repeatable and validates the supplied file.
- Data-quality summary is available via API and documented.
- Contract registry records verified vs unknown fields and their sources.
- Local storage can be rebuilt from the original input.
- FastAPI endpoints and Pydantic schemas are documented and tested.
- Tests cover malformed files, missing fields, invalid dates, duplicate keys, zero volume, missing OHLC, and unsupported instrument types.
- Insufficient history is explicitly reported for rolling analytics and backtests.
- Handoff notes tell the other two developers exactly how to run the backend and what API fields are stable.
