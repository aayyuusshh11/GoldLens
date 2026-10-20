# Data Acquisition Manifest (Pass 15)

Observed sessions: **2** ['2026-10-16', '2026-10-19']
Candidate trading days (first observed -> 2026-10-20): 3
Missing (no bhavcopy on disk): **1**

| Date | Weekday | Note |
|---|---|---|
| 2026-10-20 | Tue | morning closed, evening session may trade (bhavcopy may still exist) |

Calendar: Covers calendar year 2026 only; exchange may alter holidays by circular. Dates outside 2026 are calendar_unverified, not trading days.
Sources: https://www.mcxindia.com/market-operations/trading-surveillance/trading-holidays (accessed 2026-10-20); Corroborated: Times of India MCX holidays 2026; ICICI Direct; BSE commodity segment list

## Pair requirements status

| Pair | Shared valid obs | Floor 30 | Z warmup 15 | Walk-forward 70 | Unmet |
|---|---|---|---|---|---|
| GOLDM_near20261204_far20270105 | 2 | UNMET | UNMET | UNMET | floor, z_warmup, walkforward |

## Download list (Pass 17 — import & verification guidance)

**Already imported — DO NOT re-download:**
- `2026-10-16` (`BhavCopyDateWise_16102026.csv`, sha256 `97fb1028…53e`; also `…(2).csv`)
- `2026-10-19` (`BhavCopyDateWise_19102026.csv`, sha256 `f5ae9c5a…630c`)
(late Pass-16/Pass-15 notes listing "12–16 Oct" are superseded: 16 Oct is
already covered; requesting it again only duplicates human effort.)

**Wanted this cycle (weekdays not yet observed, from the authoritative 2026
calendar + coverage manifest):**

| Date | Weekday | Note |
|---|---|---|
| 2026-10-12 | Mon | catch-up |
| 2026-10-13 | Tue | catch-up |
| 2026-10-14 | Wed | catch-up |
| 2026-10-15 | Thu | catch-up |
| 2026-10-20 | Tue | Dassera: morning closed, evening open — check if file was published |

**Further catch-up after those (same rule: weekdays minus official full
holidays, verified against the manifest before each trip):** 2026-10-21
(Wed) onward, then progressively earlier weeks (e.g. 2026-10-05 onwards,
skipping nothing until 28 Sep…). Target ~30 sessions for the eligibility
floor, ~100 for comfortable walk-forward.

**Duplicate imports are safe (the loader dedups by resolved path + conflict
rules), but duplicates are unnecessary** — check `manifest_imported.json`
and `DATA_ACQUISITION_MANIFEST.json` before downloading.

## Post-import verification runbook (after files land in `data/raw/mcx/`)
1. `py -3.13 -m quant.ingestion.coverage` — session count must rise by
   EXACTLY the number of distinct `TRD_DATE` values in the new files
   (never more: duplicate files must not create new sessions).
2. `py -3.13 quant/run_quant.py` — GOLDM observations may rise only where
   BOTH legs traded valid closes that session; if the new date has only one
   leg, the obs count must NOT rise (note which file, why).
3. Confirm pair expiries unchanged (`near20261204_far20270105`); a change
   means the latest-date pair rotated — investigate before accepting.
4. `py -3.13 -m quant.ingestion.generate_reports` — readiness gates must
   only move in the direction justified by the new data (e.g. floor met at
   exactly 30 genuine observations, never earlier).
5. `py -3.13 -m pytest tests -q` — full suite must stay green.
6. Walk-forward becomes possible only at ≥ 70 usable sessions; report the
   actual count and fold dates, not optimistic projections.
7. More CSVs ≠ more usable observations: near/far overlap and validity
   rules above decide; records stay truthful (`NOT READY` until then).

## Per-file validation checklist (run for EVERY new download)
1. Filename follows `BhavCopyDateWise_<DDMMYYYY>.csv`; never overwrite an existing file (conflict -> sidecar).
2. Record SHA-256 and size; append to `data/raw/mcx/manifest_imported.json` (status `verified_imported`).
3. File opens as CSV; `TRD_DATE` parses to a single distinct trading date.
4. Row counts: raw rows vs FUTCOM rows (options excluded from observations, recorded, not counted).
5. Duplicate composite keys (symbol/expiry/type/date) resolved by conflict-aware dedup; investigate increases.
6. Blank/invalid close prices flagged (kept, never imputed).
7. Expiry dates parse; spread pairs keep near < far ordering.
8. Re-run: py -3.13 quant/run_quant.py  &&  py -3.13 -m quant.ingestion.generate_reports
9. Confirm reports did not double-count sessions (deterministic counts).

**Reminder: `NOT READY` is a data-and-validation status, not a bearish trading signal. The dashboard must communicate insufficient evidence, not strategy failure.**