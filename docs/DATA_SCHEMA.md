# GoldLens — Shared Data Schema (Phase 1)

Owner of this document: **Araham (Arhm) Jain** (data engineering). Field names are shared with:
- **Aayush Thakre** — consumes these payloads in the React frontend.
- **Aayush S. Kushwaha** — owns the quant semantics behind `signals`/`backtests`; his module (`api.py`) is referenced for integration, not replaced.

**Conventions**

- All dates in API payloads and normalized storage are **ISO-8601 dates** (`YYYY-MM-DD`), no time component. Source dates (`16 Oct 2026`, `30OCT2026`) are parsed and never emitted raw in API payloads; raw strings remain only in `source_raw`.
- Numbers are JSON numbers (float). Booleans are JSON booleans.
- **Missing values are always `null`, never `0`** and never empty strings. A reported zero (e.g. zero volume) is a meaningful observation and must be distinguishable from a missing value.
- Snake_case field names. No renaming without updating this doc.
- Every stored record carries provenance (`source_file`, `source_row`, `ingested_at`) and validation metadata.
- Every statement of a contract specification carries a `verification_status` and its source. **`unverified` is a first-class state; unknown stays unknown.**

---

## 1. Source observation (raw, immutable)

Exactly preserves the CSV columns of `BhavCopyDateWise_16102026 (2).csv`. Used to rebuild everything downstream.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `source_row` | integer | no | 1-based data-row number in the source file |
| `source_file` | string | no | file name as ingested |
| `ingested_at` | string (ISO-8601 UTC timestamp) | no | ingestion time |
| `raw_date` | string | no | original `Date` string, e.g. `16 Oct 2026` |
| `raw_instrument_name` | string | no | original `Instrument Name` |
| `raw_symbol` | string | no | original `Symbol` **with whitespace, unparsed** |
| `raw_expiry_date` | string | yes | original string, e.g. `30OCT2026` |
| `raw_option_type` | string | yes | e.g. `-`, `CE`, `PE` |
| `raw_strike_price` | number \| null | yes | |
| `raw_open` `raw_high` `raw_low` `raw_close` `raw_previous_close` | number \| null | yes | empty/malformed → null |
| `raw_volume_lots` | number \| null | yes | |
| `raw_volume_in_000s` | string \| null | yes | **raw combined string preserved**, e.g. `5091.000 GRMS ` |
| `raw_value_lacs` | number \| null | yes | lakhs of INR, source unit guaranteed only as `Lacs` label |
| `raw_open_interest_lots` | number \| null | yes | |

## 2. Normalized observation (canonical, per contract per day)

Derived from §1. One row = one `contract_id` on one `trade_date`. Nullable fields stay null.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `contract_id` | string | no | stable internal id, format `FUTCOM_GOLD_20261204` (see §3) |
| `trade_date` | string (date) | no | ISO; parsed from `Date` (`%d %b %Y`) |
| `symbol` | string | no | **trimmed, uppercased** canonical symbol |
| `symbol_raw` | string | no | original symbol as in file (whitespace preserved) |
| `instrument_type` | enum | no | `FUTCOM` \| `FUTIDX` \| `OPTFUT` \| `OPTIDX` (raw passthrough; analytics path accepts `FUTCOM` only) |
| `expiry_date` | string (date) | yes | ISO; parsed from `Expiry Date` (`%d%b%Y`) |
| `option_type` | string \| null | yes | null for futures |
| `strike_price` | number \| null | yes | null/none for futures |
| `open` `high` `low` `close` `settlement_price` | number \| null | yes | null when absent. **Never backfilled with 0.** `settlement_price` is null in this source (no settlement column exists). `close` is null only if unparsable/empty; zero-volume rows keep their reported close but are flagged (§4) |
| `previous_close` | number \| null | yes | |
| `volume_lots` | number \| null | yes | reported lots; `0` allowed and meaningful |
| `volume_quantity` | number \| null | yes | parsed numeric part of `Volume(In 000's)` (still `in 000's` as per source label) |
| `volume_unit` | string \| null | yes | e.g. `GRMS`, `KGS`, `BBL`, `mmBtu`, `UNIT`, `BALES`, `MT`, `MWH` — **source label only, not converted** |
| `value_lacs` | number \| null | yes | source unit (lakhs of INR) preserved as-is |
| `open_interest_lots` | number \| null | yes | |
| `has_ohlc` | boolean | no | true iff open, high, low present |
| `zero_volume` | boolean | no | true iff `volume_lots == 0` (distinct from null volume) |
| `is_tradable_candidate` | boolean | no | `has_ohlc && !zero_volume` — structural flag only; **does not verify tradability** |
| `source_file`, `source_row`, `ingested_at` | — | no | provenance |
| `validation_flags` | array of reason codes (§5) | no | may be empty |

Uniqueness (idempotency key): `(trade_date, instrument_type, symbol, expiry_date, option_type, strike_price)`. Re-ingestion must upsert, not duplicate.

## 3. Contract registry record

One record per canonical `(symbol, instrument_type, expiry_date)` observed. **All specification fields start `unverified`; nothing is guessed from symbol names.**

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `contract_id` | string | no | `{INSTRUMENT}_{SYMBOL}_{YYYYMMDD}` |
| `symbol` | string | no | trimmed canonical |
| `instrument_type` | enum | no | |
| `expiry_date` | string (date) | yes | ISO |
| `contract_size` | number \| null | yes | null until verified; **unit of `units`** |
| `units` | string \| null | yes | e.g. `KG`, `GRM`, `BBL` (authoritative spec wording) |
| `quotation_unit` | string \| null | yes | e.g. `INR per 10 grams` |
| `purity` | string \| null | yes | e.g. `99.9%Au` |
| `tick_size` | number \| null | yes | |
| `expiry_rule` | string \| null | yes | textual rule if known |
| `verification_status` | enum | no | `verified` \| `unverified` \| `conflicting` |
| `verified_fields` | array of string | no | which of the above spec fields are verified |
| `source` | string \| null | yes | authoritative source id, only for verified fields |
| `verification_timestamp` | string (UTC ISO) \| null | yes | |
| `effective_from` | string (date) \| null | yes | spec effective window |
| `effective_to` | string (date) \| null | yes | |
| `first_observed_date` | string (date) | no | first trade_date seen in data |
| `last_observed_date` | string (date) | yes | |

## 4. Data-quality report

See `API_CONTRACT.md → GET /api/data-quality` for the wrapper; the reuseable item type is:

```json
{ "code": "ZERO_VOLUME_ROWS", "severity": "warning", "count": 14592, "message": "..." }
```

Rules encoded in code (not prose): **zero volume ≠ missing volume ≠ null OI**; data quality never claims multi-day history when one date exists; contract spec verification status is always surfaced.

## 5. Reason codes (shared catalogue)

Severity is per-use; catalogued codes are stable strings.

| Code | Meaning |
|---|---|
| `INSUFFICIENT_HISTORY` | not enough distinct chronological observations for the requested analysis |
| `NO_PAIR` | no comparable eligible pair |
| `NO_LIQUIDITY` | candidate rows lack volume/OI above agreed thresholds |
| `ZERO_VOLUME` | row observed with volume 0 |
| `MISSING_OHLC` | open/high/low absent |
| `MISSING_SETTLEMENT` | settlement price unavailable (always, in this source) |
| `INVALID_RANGE` | e.g. high < low |
| `DUPLICATE_KEY` | business key repeated |
| `UNIT_UNPARSED` | volume-quantity/unit could not be parsed |
| `UNSUPPORTED_INSTRUMENT` | e.g. `OPTFUT`/`OPTIDX`/`FUTIDX` on the gold-futures path |
| `EXPIRY_SEPARATOR` | near/far expiry too close/too far — quant-owned thresholds |
| `UNVERIFIED_SPEC` | contract specification not verified by an authoritative source |
| `STALE_PRICE` | non-null close on zero-volume row |
| `EXPIRED_ROW` | expiry on/before trade_date |

## 6. Decisions still requiring confirmation

1. **Quant (Aayush S.K.):** `decision` enum wording for signals (proposed: `NO_TRADE` \| `BUY_NEAR_SELL_FAR` \| `SELL_NEAR_BUY_FAR`); z-score window/minimums; cost model fields; how his `api.py` DTOs map to the `signal`/`backtest` response fields below.
2. **Quant (Aayush S.K.):** whether any spec from his verified-spec workstream may be seeded into the registry as `verified` (with source + timestamp), or the registry stays `unverified` until he publishes the verification.
3. **Frontend (Aayush T.):** snake_case is currently canonical — confirm; paging for `GET /api/contracts` (default limit 500 — confirm); whether ISO dates should render with timezone context.
4. **All:** error HTTP-code mapping (proposed in API_CONTRACT §10).
