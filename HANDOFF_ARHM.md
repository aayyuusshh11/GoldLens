# GoldLens — Arhm Jain Handoff / AI Continuity Notes

**Owner:** Araham (Arhm) Jain  
**Workstream:** Data engineering, contract registry, FastAPI, storage  
**Purpose:** Paste this file into a new AI conversation so the next model knows the verified context and does not assume earlier implementation happened.

## 1. What is known about the project

GoldLens is a three-person hackathon prototype for MCX gold-futures relative-value analysis. It must import and validate available historical data, verify contract specifications, normalize comparable contracts, calculate pairwise spreads and rolling z-scores, apply expiry/liquidity checks, estimate transaction costs, run chronological walk-forward backtests, and explain decisions including NO TRADE.

Team ownership:
- Aayush Thakre: team lead, frontend, full-stack integration and deployment.
- Aayush S. Kushwaha: quant methodology, normalization, signal calculations and backtesting.
- Araham (Arhm) Jain: data engineering, contract registry, FastAPI and storage.

Technology target:
- Frontend: React, Vite, TypeScript, Tailwind CSS, shadcn/ui, Recharts.
- Backend: Python, FastAPI, Pydantic.
- Analytics: pandas, NumPy, SciPy as needed.
- Storage: DuckDB or lightweight local equivalent.
- Tests: pytest and suitable frontend/build checks.

## 2. Supplied data file: actual inspection findings

Inspected input: `BhavCopyDateWise_16102026 (2).csv`

Measured facts from the supplied file:
- Shape: **15,535 rows × 15 columns**.
- Date field has exactly **one unique value: `16 Oct 2026`**.
- Columns: `Date`, `Instrument Name`, `Symbol`, `Expiry Date`, `Option Type`, `Strike Price`, `Open`, `High`, `Low`, `Close`, `Previous Close`, `Volume(Lots)`, `Volume(In 000's)`, `Value(Lacs)`, `Open Interest(Lots)`.
- Instrument type counts: `OPTFUT` 14,730; `OPTIDX` 630; `FUTCOM` 168; `FUTIDX` 7.
- There are 31 distinct raw `Symbol` values; many contain trailing spaces.
- No exact duplicate full rows were found.
- `Open`, `High`, and `Low` each have 14,592 nulls across the full file.
- Futures (`FUTCOM`) include 168 rows. Relevant gold-family symbols are `GOLD`, `GOLDM`, `GOLDTEN`, `GOLDGUINEA`, and `GOLDPETAL`.
- For the GOLD FUTCOM rows, there are six expiries on the date. The Dec-2026 GOLD row has reported volume 5,091 lots and OI 16,717; Feb-2027 has volume 119 and OI 648; later GOLD rows show zero volume. This is a snapshot observation only and does not validate contract eligibility.
- The `Volume(In 000's)` field contains strings such as `5091.000 GRMS`, so the number and unit need careful parsing. Preserve raw source values.
- Many options have a populated close despite zero volume and missing OHLC. A populated close alone is not proof of an executable/tradable price.
- A single date cannot support rolling z-scores, chronological walk-forward backtesting, or defensible performance statistics.

Important: these facts describe the uploaded CSV. They do **not** prove official contract size, quotation unit, purity, tick size, or the comparability of any two gold products. Verify those details from an authoritative source and record provenance/effective dates.

## 3. What the previous AI has actually done

- It inspected the supplied CSV in a Python session and measured the data facts above.
- It prepared planning content for three files: a README, phased implementation prompts, and a handoff/continuity note.
- **No repository was inspected in this conversation.**
- **No backend source code, tests, API routes, storage layer, or contract registry have been implemented in the repository by this work.**
- Do not say the app is built or tests pass until a coding session actually implements and runs them.
- Do not assume the files described here have been copied into the project repository. Check their actual presence first.

## 4. Next actions

1. Open the actual project repository and inspect `pwd`, `git status`, current branch, and file tree before editing.
2. Confirm the uploaded CSV is available at the working path. Do not move or modify the original.
3. Create/update `docs/DATA_AUDIT.md` from measured file facts.
4. Agree `docs/DATA_SCHEMA.md` and `docs/API_CONTRACT.md` with Aayush Thakre and Aayush S. Kushwaha before implementation.
5. Implement CSV validation/ingestion first, then storage/registry, data-quality reporting, API endpoints, tests, and handoff.
6. Work on a feature branch. Never commit to main without team approval.

## 5. Non-negotiable design rules

- Never invent data or label synthetic data as actual exchange data.
- Never guess contract specs from symbol names.
- Do not treat options as futures.
- Preserve missing values as null; do not replace missing prices with zero.
- Distinguish zero volume from missing volume.
- Preserve source file and row provenance.
- Do not infer tradability from a non-null close.
- Do not return fabricated z-scores, backtest metrics, or profitable signals from a one-day snapshot.
- When the data is insufficient, return structured warnings and a NO TRADE / insufficient-data outcome.
- Avoid unnecessary infrastructure and paid APIs within the three-day MVP.

## 6. Cross-team handoffs

### To Aayush Thakre (frontend/integration)
Provide stable, documented Pydantic response shapes for:
- `/api/health`
- `/api/contracts`
- `/api/pairs`
- `/api/pairs/{pair_id}/history`
- `/api/signals/analyze`
- `/api/backtests/run`
- `/api/data-quality`

Coordinate field names and error/warning shape before the frontend hardcodes them. Ensure the frontend can show data freshness, missing history, unverified specifications, zero-volume observations, and NO TRADE reasons.

### To Aayush S. Kushwaha (quant)
Ask for exact definitions and agreed service interfaces for:
- Comparable contract pairs and normalization.
- Spread formula and units.
- Rolling z-score window and minimum observations.
- Signal thresholds and entry/exit/neutral logic.
- Expiry exclusion/roll rules.
- Liquidity criteria.
- Transaction-cost assumptions.
- Walk-forward split, execution timing, and no-look-ahead safeguards.

Do not independently invent these definitions in API routes. One date means the quant service should report insufficient history until additional dates are available.

## 7. Suggested API behavior when data is insufficient

Return a documented, structured response rather than made-up values. For example, a signal analysis may return `decision: "NO_TRADE"` with reason code `INSUFFICIENT_HISTORY`, null `z_score`/edge fields, and `data_quality` warnings. Final field names must match `docs/API_CONTRACT.md`.

Backtest requests should return a clear validation response or a documented non-runnable status if the dataset cannot support the requested evaluation period. Do not fabricate observation counts or P&L.

## 8. Ready-to-paste prompt for the next AI

“You are continuing GoldLens as Arhm Jain, responsible for data engineering, contract registry, FastAPI, and local storage. Read this handoff first, then inspect the actual repository, Git status, and existing files before editing. The only inspected data so far is `BhavCopyDateWise_16102026 (2).csv`: 15,535 rows, 15 columns, one date (16 Oct 2026), 168 FUTCOM rows, and many missing OHLC fields. This is insufficient for rolling z-scores or walk-forward backtesting. No repository implementation or tests have been completed by the previous AI. Do not assume any files exist unless you verify them. Continue with Phase 0 in `IMPLEMENTATION_PHASES_ARHM.txt`, then proceed one phase at a time. Preserve nulls and provenance; never guess contract specs or invent results. At every phase, report changed files, commands actually run, test results, unresolved issues, and exact handoff to the other teammates.”
