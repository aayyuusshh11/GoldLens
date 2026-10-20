# GoldLens — Data Audit (Phase 0, Araham Jain workstream)

**Audited file:** `BhavCopyDateWise_16102026 (2).csv` (located in the repository root; **not moved, copied, or modified** — file hash-checked by size before/after: 1,918,268 bytes)
**Audit method:** measured directly from the file in a Python 3.13.5 session (stdlib `csv` module). All counts below were recomputed from the actual file on 2026-10-20; nothing is hardcoded from prior notes.
**Status of the repository at audit time:** no backend code, no tests, no storage layer existed for this workstream. Two pre-existing files (`api.py`, `api_contract_sample.json`) are the quant module's integration boundary provided for reference; they were **not touched**.

---

## 1. Measured file facts

| Property | Measured value |
|---|---|
| Data rows | **15,535** |
| Columns | **15** |
| Unique `Date` values | **1** — `16 Oct 2026` (every row) |
| Exact duplicate full rows | **0** |
| Duplicate business keys¹ | **0** |
| File size | 1,918,268 bytes (UTF-8) |

¹ Business key = (`Date`, `Instrument Name`, trimmed `Symbol`, `Expiry Date`, `Option Type`, `Strike Price`).

### Columns (source order)
`Date`, `Instrument Name`, `Symbol`, `Expiry Date`, `Option Type`, `Strike Price`, `Open`, `High`, `Low`, `Close`, `Previous Close`, `Volume(Lots)`, `Volume(In 000's)`, `Value(Lacs)`, `Open Interest(Lots)`

### Instrument type counts
| Instrument | Rows | Missing O/H/L | Zero volume |
|---|---:|---:|---:|
| `OPTFUT` | 14,730 | 13,883 | 13,883 |
| `OPTIDX` | 630 | 630 | 630 |
| `FUTCOM` | 168 | 72 | 72 |
| `FUTIDX` | 7 | 7 | 7 |
| **Total** | **15,535** | **14,592** | **14,592** |

Notes:
- For every instrument type, the count of rows with missing `Open`/`High`/`Low` **exactly equals** the count of zero-volume rows of that type. Missing OHLC and zero volume co-occur to the row.
- **943 rows** have positive volume (168 FUTCOM, 630 OPTIDX, 7 FUTIDX, 138 OPTFUT).

### Symbols
- **31 distinct raw symbol strings; all 31 have trailing spaces** (e.g. `'GOLD         '`, `'ALUMINI      '`). The number of distinct raw strings equals the number of trimmed values (31) — whitespace does not create split identities here, but trimming is mandatory before any join/reg. Raw values must be retained for provenance.
- No leading spaces observed; only trailing.

### Missing / degenerate price fields
- `Open`, `High`, `Low`: **14,592 nulls each** (all rows lacking a genuinely traded session).
- On those same 14,592 rows, `Close` and `Previous Close` are **populated**. That is, **14,592 rows have a populated close with zero volume** — of which **14,513 are option rows**. This is the primary tradability trap in this file: *a populated close is not evidence of an executable price.*
- Zero `Open Interest(Lots)` rows: **14,346**; missing volume/OI: **0** (population is complete; zeros are meaningful observed values, not nulls).
- No non-numeric values in `Close`/`Previous Close`; no `High < Low` violations (checked where both present).
- `Option Type = '-'` and `Strike Price = 0` on all futures rows (by construction).

### `Volume(In 000's)` field
- Fully populated; **always `number + unit token`** (e.g. `5091.000 GRMS `, `3720.300 GRMS `). Never a bare number.
- Unit tokens measured: `KGS` 7,810 · `GRMS` 4,576 · `BBL` 1,428 · `mmBtu` 1,070 · `UNIT` 637 · `BALES` 5 · `MT` 5 · `MWH` 4.
- The unit belongs to the **underlying quantity**, not to lots. Number and unit must be parsed separately; the raw string must be preserved.

### Dates
- `Date`: format `d Mon YYYY` (e.g. `16 Oct 2026`). One unique value.
- `Expiry Date`: format `dMonYYYY` (e.g. `30OCT2026` — no spaces; a different format token than `Date`). All 15,535 parse with `%d%b%Y`.
- **67 distinct expiries**, range `2026-10-19` … `2028-03-20`.
- No row has an expiry on/before the file date (0 expired rows).

### Futures (`FUTCOM`) — path relevant to GoldLens
- **168 FUTCOM rows** across **27 unique commodity symbols**; **96 of 168 rows have volume > 0**.
- Gold-family row counts (`FUTCOM` only): `GOLD` 6, `GOLDM` 6, `GOLDTEN` 6, `GOLDGUINEA` 6, `GOLDPETAL` 6. (Silver family also present: `SILVER` 5, `SILVER100` 6, `SILVERM` 6, `SILVERMIC` 4.)
- Observed per-expiry rows (expiry ↓, close, volume lots, OI lots) — **observations only**:

| Symbol | Expiry | Close | Volume (lots) | OI (lots) |
|---|---|---:|---:|---:|
| GOLD | 2026-12-04 | 147,918 | 5,091 | 16,717 |
| GOLD | 2027-02-05 | 150,364 | 119 | 648 |
| GOLD | 2027-04-05 | 152,306 | 0 | 38 |
| GOLD | 2027-06-04 | 154,081 | 0 | 2 |
| GOLD | 2027-08-05 | 156,327 | 0 | 0 |
| GOLD | 2027-10-05 | 155,143 | 0 | 0 |
| GOLDM | 2026-11-05 | 146,425 | 37,203 | 49,954 |
| GOLDM | 2026-12-04 | 147,866 | 11,780 | 19,078 |
| GOLDM | 2027-01-05 | 149,227 | 1,158 | 4,382 |
| GOLDM | 2027-02-05 | 150,559 | 444 | 2,250 |
| GOLDM | 2027-03-05 | 151,932 | 151 | 407 |
| GOLDM | 2027-04-05 | 153,161 | 17 | 34 |
| GOLDTEN | 2026-10-30 | 146,819 | 17,302 | 29,161 |
| GOLDTEN | 2026-11-30 | 148,237 | 10,235 | 18,730 |
| GOLDTEN | 2026-12-31 | 149,721 | 3,013 | 8,321 |
| GOLDTEN | 2027-01-29 | 151,177 | 1,574 | 4,004 |
| GOLDTEN | 2027-02-26 | 152,458 | 439 | 1,043 |
| GOLDTEN | 2027-03-31 | 153,611 | 67 | 187 |
| GOLDGUINEA | 2026-10-30 | 118,009 | 7,252 | 13,938 |
| GOLDGUINEA | 2026-11-30 | 119,216 | 3,557 | 8,835 |
| GOLDGUINEA | 2026-12-31 | 120,237 | 1,478 | 4,020 |
| GOLDGUINEA | 2027-01-29 | 121,340 | 428 | 1,896 |
| GOLDGUINEA | 2027-02-26 | 122,463 | 92 | 563 |
| GOLDGUINEA | 2027-03-31 | 123,583 | 46 | 88 |
| GOLDPETAL | 2026-10-30 | 14,755 | 161,865 | 192,717 |
| GOLDPETAL | 2026-11-30 | 14,889 | 53,396 | 151,841 |
| GOLDPETAL | 2026-12-31 | 15,035 | 25,060 | 70,642 |
| GOLDPETAL | 2027-01-29 | 15,176 | 5,964 | 38,951 |
| GOLDPETAL | 2027-02-26 | 15,311 | 2,628 | 13,943 |
| GOLDPETAL | 2027-03-31 | 15,422 | 1,604 | 5,070 |

(gold/other metals/cotton/oil FUTCOM rows omitted for brevity but counted above.)

---

## 2. Limitations

1. **One date ≠ history.** The file contains exactly one trading day. Rolling z-scores, walk-forward backtesting, seasonality, volatility estimates, and any historical performance claim are **not possible** from this input. Any signal/backtest service must return an explicit insufficient-history outcome for this dataset.
2. **Zero-volume rows are not tradable observations.** 14,592 rows have zero volume; their populated closes are reference/marker values, not executed prices. Volume-quantity and volume-unit strings (`KGS`, `GRMS`, `BBL`, `mmBtu`, `UNIT`, `BALES`, `MT`, `MWH`) differ per commodity and must not be normalized blindly.
3. **Options must not be treated as futures.** 15,360 rows are options (`OPTFUT`/`OPTIDX`); the gold-futures analytics path only consumes `FUTCOM`.
4. **Contract specifications are unknown from this file.** Nothing here proves contract size, purity, quotation unit, tick size, or expiry rule for any symbol. These must be verified from an authoritative source and stored with provenance + effective dates before any contract may be marked eligible. (A separately maintained verified-spec report by the quant owner exists outside this file's scope; until that verification is available in this repo's registry, all specs are unknown.)
5. **No settlement price column exists.** `Close` is the only final price field; `Previous Close` is contextual.
6. Symbol strings carry trailing whitespace; any naive grouping/joining on raw `Symbol` is unsafe.

## 3. Reproduction

All numbers above can be regenerated from the untouched CSV:

```powershell
python - <<'PY'
import csv
rows = list(csv.DictReader(open(r'BhavCopyDateWise_16102026 (2).csv', encoding='utf-8-sig')))
print(len(rows), len(rows[0]), {r['Date'] for r in rows})
from collections import Counter
print(Counter((r['Instrument Name'] or '').strip() for r in rows))
PY
```

## 4. Phase 0 status

- Repository inspected before editing (branch `Araham-jain`; repo root is the user profile directory — commits will be restricted to files under `GoldLens/`).
- `api.py` / `api_contract_sample.json` preserved untouched (quant-module boundary reference).
- No endpoints implemented. No destructive commands run. Original CSV untouched.
