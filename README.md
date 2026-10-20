# GoldLens — MCX Gold Futures Intelligence Platform

GoldLens is a quantitative analytics and trading engine for MCX Gold calendar spreads (`GOLD` 1kg and `GOLDM` 100g futures).

---

## Developer Quickstart & Reproducibility Guide

### 1. Where to Place Manually Downloaded MCX Files
Place daily MCX Bhavcopy CSV files in:
```
data/raw/mcx/BhavCopyDateWise_<DDMMYYYY>.csv
```
*(Files placed directly in the repository root are also discovered for backward compatibility, but `data/raw/mcx/` is the standard location).*

Official download source: [MCX Bhavcopy Portal](https://www.mcxindia.com/market-data/bhavcopy) (select Instrument `ALL`, click **Show**, and download the daily CSV).

---

### 2. How to Run Ingestion & Pipeline
The ingestion pipeline discovers all genuine files, filters `FUTCOM` contracts, drops options and unpriced marks, resolves key conflicts, and computes daily calendar spreads:
```powershell
py -3.13 quant/run_quant.py
```
This automatically updates `quant_report.json` with strategy results and diagnostic explanations.

---

### 3. How to Run Validation & Audit Reports
To validate all ingested files, run schema checks, calculate deduplication metrics, and execute the readiness audit:
```powershell
py -3.13 -m quant.ingestion.generate_reports
```
This regenerates:
- `data/reports/DATA_QUALITY_REPORT.md` (and `.json`)
- `data/reports/BACKTEST_READINESS.md` (and `.json`)
- Mirrors in `docs/`

---

### 4. How to Run Tests
Execute the complete test suite:
```powershell
py -3.13 -m pytest tests -q
```
Current test suite status (executed 2026-10-20, Pass 12): **103 passed, 0 failed**.

---

### 5. How to Interpret Readiness Status
Read `data/reports/BACKTEST_READINESS.md`:
- **`READY`**: All 5 gates passed. At least 30 spread sessions exist for the target pair, 100+ for walk-forward, verified costs are fully configured, and the engine executed cleanly.
- **`NOT READY`**: At least one gate failed. For example:
  - `minSpreadObservations`: Requires $\ge 30$ valid dated spread sessions for the target pair (currently 2 sessions).
  - `walkForwardViability`: Requires $\ge 100$ spread sessions to run expanding-window folds.
  - `costInputsVerified`: Requires brokerage and slippage to be verified against trader contract notes.

*Important distinction (Pass 11 fix):* The audit strictly reports the time-series spread observations of the target trading pair (`GOLDM`: 2 sessions across 2026-10-16 and 2026-10-19). It never sums cross-sectional candidate counts across unrelated commodities.

---

### 6. What to Do When Data is Insufficient
When the dataset has fewer than 30 spread sessions:
1. The engine refuses to fabricate a backtest and operates in **`diagnostics_only`** mode.
2. Signal generation outputs `NO TRADE` with rationale `insufficient history for roll z (need >= 15d, lookback 30d)`.
3. Metrics are withheld (`gross_pnl: null`, `runnable: false`).
4. **Action required:** Obtain additional daily bhavcopies from MCX (or an authorized EOD feed via `datafeed@mcxindia.com`), place them in `data/raw/mcx/`, and rerun `generate_reports.py`.

---

### 7. How to Configure Verified Transaction-Cost Inputs
Transaction costs are configured via `CostInput` in `quant/config.py`:

```python
from quant.config import CostInput, StrategyConfig

costs = CostInput(
    # Statutory / Exchange verified charges:
    exchange_transaction_bps_on_turnover=0.21,  # Rs 2.10 per lakh (0.0021%, MCX eff 1 Oct 2024)
    stamp_duty_buy_side_bps_on_turnover=0.2,    # 0.002% BUY side only (Indian Stamp Rules 2019 eff 1 Jul 2020)
    ctt_bps_on_sell_turnover=1.0,               # 0.01% SELL side only (Finance Act 2013 eff 1 Jul 2013)
    gst_rate_on_transaction_charges=0.18,       # 18% GST on exchange transaction fees
    tick_size_rupees_per_quote_unit=1.0,        # Rs 1 per 10g quote unit

    # Trader-specific inputs (must come from broker contract note):
    brokerage_rupees_per_lot=20.0,              # Supply verified rate from broker
    slippage_ticks=1.0,                         # Supply measured fill slippage or stated policy
)

cfg = StrategyConfig(costs=costs)
```

If `brokerage` or `slippage` is unverified, `costs` defaults to `None` and Net P&L is withheld to prevent misleading performance claims.

See `docs/COST_MODEL.md` for full statutory citations and formulas.

---

### 8. How to Configure the Shared Backend Adapter
GoldLens integrates with FastAPI via `quant/service_adapter.py`.

Set the environment variable in the backend environment:
```powershell
$env:GOLDLENS_QUANT_PACKAGE = "quant.service_adapter"
$env:GOLDLENS_DATA_DIR = "d:/HACKthon/HillToHill/GOLD"  # optional, auto-discovered if not set
```

The adapter exposes:
- `get_quant_service()`
- `analyze_signal(pair_id, as_of_date)`
- `run_backtest(pair_id, start_date, end_date, strategy_version)`

See `docs/BACKEND_BLOCKER3_HANDOFF.md` for backend patch diffs and integration guidelines.

---

### 9. Core Conventions
- **Contract families:** `GOLD` (1 kg / 1000g, rvalue = 100) and `GOLDM` (100g, rvalue = 10).
- **Quote basis:** ₹ per 10 grams.
- **Spread convention:** `spread = far_close - near_close` (strictly far minus near).
- **Execution mode:** `next_close` (causal rolling z-scores; decisions executed at next session close, eliminating look-ahead bias).
