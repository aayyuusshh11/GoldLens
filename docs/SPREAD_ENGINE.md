# GoldLens — Spread & Signal Engine (formulas, assumptions, limitations)

Owner: Aayush S. Kushwaha — quant strategy & backtesting module. Lives entirely in `quant/`.

## 1. Contract universe / comparability

- Only verified MCX contract families are usable (`quant/contracts.py`):
  | symbol | product (MCX page)     | lot size | quote basis | purity |
  |--------|------------------------|----------|-------------|--------|
  | GOLD   | Gold (1 kg)            | 1000 g   | Rs/10 g     | 995    |
  | GOLDM  | Gold Mini (100 gram)   | 100 g    | Rs/10 g     | 995    |
- Registry values are cross-checked against verified aggregates in the repo
  (YearWise report: total value / lots vs bhavcopy close) by
  `cross_check_spec()`; > 10 % relative error fails loudly.
- `GOLDM − GOLD` is a **bar-size premium**, not a calendar spread. Cross-symbol
  legs are disabled (`cfg.allow_cross_symbol=False`) and require an explicit
  opt-in plus tenor matching. Legacy symbols without registry entries are
  rejected with `symbol_not_verified`.

## 2. Spread construction (`quant/spreads.py`)

```
spread(t) = far_close(t) − near_close(t)      [Rs per 10 g; same family]
```

- near = earliest expiry of the day that ACTUALLY TRADED (volume > 0); a
  zero-volume settlement mark can never anchor the near leg.
- far = next eligible expiry after near; both legs must be eligible on the
  signal day (see filters below).
- Days where either leg has a missing, non-finite or ≤ 0 close produce **no
  row** (no interpolation, no mean/median substitution) and are counted in
  `invalid_price_rows_dropped`.
- Rows where either leg has volume 0 are flagged `stale` and cannot gate
  entries.

## 3. Rolling statistics (`quant/zscore.py`) — past only

```
mean_t  = mean( spread_{t−L+1..t} ),  L = cfg.lookback_days
std_t   = std( spread_{t−L+1..t} )   [ddof=1]
z_t     = (spread_t − mean_t) / (std_t)   [std = 0 => z undefined, NaN]
```

- `min_periods = cfg.min_hist_days`; before that z is NaN and the signal is
  **NO TRADE (flat) / HOLD (in position)** with reason
  `insufficient history`.
- Causality is verified by `test_zscore_causality_no_lookahead`: z(t) computed
  on the full panel equals z(t) computed by truncating history to ≤ t.

## 4. Signals (`quant/signals.py`) — configurable thresholds

| rule (flat position)   | condition            | result        |
|------------------------|----------------------|---------------|
| entry long             | z_t ≤ −cfg.z_entry   | LONG SPREAD   |
| entry short            | z_t ≥ +cfg.z_entry   | SHORT SPREAD  |
| nothing                | else                 | NO TRADE      |
| stop (any position)    | \|z_t\| ≥ cfg.stop_z | EXIT          |
| long mean-reversion    | z_t ≥ −cfg.z_exit    | EXIT          |
| long hold              | z_t < −cfg.z_exit    | HOLD          |
| short mean-reversion   | z_t ≤ +cfg.z_exit    | EXIT          |
| short hold             | z_t > z_exit         | HOLD          |
| missing z (flat)       | z NaN/None           | NO TRADE      |
| missing z (in pos)     | z NaN/None           | HOLD          |

- Additional exits: consecutive `cfg.max_holding_days` calendar days in
  position; optional sustained eligibility breach
  (`cfg.exit_on_filter_breach`, default HOLD, configurable).
- Every signal carries a structured explanation: signal, z, spread, mean,
  std, filters_ok, filter_reason, position, rationale (also for REJECTED
  trades).

## 5. Filters (rejections, `quant/selection.py`)

A contract passes on a day only if ALL hold, each failure producing an
enumerated reason:

- verified metadata exists for the symbol (`symbol_not_verified`)
- close > 0 and finite, high ≥ low (`invalid_price`, `no_valid_price_or_expiry`)
- volume ≥ min_volume_lots, OI ≥ min_open_interest_lots,
  traded value ≥ min_traded_value_lakhs (stale zero-volume contracts are
  excluded by the volume floor plus `stale` flag; they are never silently
  substituted)
- days-to-expiry ∈ [min_days_to_expiry, max_days_to_expiry] — keeps the
  delivery window out and avoids untradeable far tenors

## 6. Execution & accounting (`quant/engine.py`)

- Execution convention is configurable (`cfg.exec_mode`); only `"next_close"`
  is supported: signal at t (rows ≤ t) fills at the NEXT session's close in
  the spread panel. Same-bar conventions are rejected at `cfg.validate()`
  because without intraday data they would execute past signals on future
  information. Fills are verified by
  `test_execution_delay_prevents_lookahead`.
- One pair position at a time; `allow_overlap` must stay False (rejected
  otherwise) — no overlapping or duplicate positions are ever opened.
- Position sizing: `cfg.lots_per_leg` scales P&L linearly
  (verified by `test_position_sizing_scales_pnl_linearly`).
- Daily P&L = MTM on spread deltas; per-trade gross
  `= ±(exit_exec_spread − entry_exec_spread) × rvalue × lots_per_leg`, where
  `rvalue = lot_size_g / quote_basis_g` (GOLD 100, GOLDM 10).
- Costs apply ONLY when `cfg.costs = CostInput(...)` is provided with
  verified numbers (brokerage/lot, exchange txn/lot, stamp bps on turnover,
  GST on txn charges, slippage ticks). Otherwise gross-only reporting with
  `costs_not_configured` warning and `metrics_basis="gross_only_costs_missing"`
  — costs are never assumed zero.
- QA contract: daily P&L chain reconciles with per-trade realized P&L —
  `sum(daily_pnl) == sum(realized)` per trade and in aggregate, including the
  exit-signal day (its MTM delta accrues on that day, with the closing delta
  booked on the next session's close). Signal-day deltas on the entry day and
  entry-signal day are zero by construction (fills at that day's close).
- Forced liquidation: when the dataset ends with a position open, the
  `end_of_data` forced close books the closing delta and charges NO exit cost
  (synthetic event, not an actual order ticket); the entry cost for that trade
  still applies. Total cost events = `2×n_trades − count(end_of_data exits)`.
- Metrics: gross AND net P&L, trade count (from realized trades), win rate,
  max drawdown and annualized Sharpe on the NET equity curve when costs are
  configured (net `_net_` fields), gross otherwise. Sharpe requires
  ≥ `min_days_for_sharpe` observations and std > 0.
- Walk-forward: expanding chronological windows
  (`cfg.walk_forward_folds`); `compare_walk_forward()` tabulates fold-by-fold
  windows, P&L, trades, win rate, drawdown, Sharpe and the delta vs the
  previous fold. Reproducibility: identical inputs + config give identical
  trade lists, costs and metrics (`test_costs_are_deterministic_across_reruns`).

## 6b. Date-gap rule

The engine operates on the session rows present in the spread panel (days
where both legs traded). Calendar gaps remove rows; no synthetic rows, no
interpolation and no re-dated fills are ever created
(`test_missing_dates_create_no_fabricated_rows`), and z/MTM accountings stay
identically defined on the remaining chronology.

## 7. Assumptions & limitations

1. **Single-day repo data.** Only 16 Oct 2026 is available. z-scores need
   ≥ 15 sessions; with one day all signals are legitimately NO TRADE and the
   report flags "NOT A VALID BACKTEST". Estimate statistics require months of
   daily files dropped in the repo root (`BhavCopyDateWise_*.csv` glob).
2. Quote basis (Rs/10 g) and lot sizes come from MCX product pages + a
   repo data cross-check; a contract circular PDF is the stronger source and
   should supersede this registry if the team obtains it.
3. Spread series mixes contracts whereas the world needs roll handling;
   per-pair analysis avoids this by construction (fixed near/far expiries).
4. Blended-path fills assume close prices are executable — in reality spreads
   are transacted as legs with wider effective costs; slippage config exists
   but must be feed-verified before any net conclusion.
5. Sharpe is reported only with ≥ `min_days_for_sharpe` observations and the
   annualization factor (252) is a market convention, not claimed from data.
6. Statistical assumptions: spread roughly mean-reverting over the lookback;
   rolling std uses ddof=1; no de-trending is applied.

## 8. Integration API (`quant/api.py`)

Typed boundary for app/backend teammates. Call only these functions:

| function | input | output | errors |
|---|---|---|---|
| `load_dataset(paths)` | CSV paths | `ValidatedDataset`(frame, trading days, provenance, spec checks) | `SchemaError`, `DataQualityError` |
| `validate_bhavcopy_frame(df)` | DataFrame | same frame | `SchemaError` (missing cols), `DataQualityError` (empty/no traded rows) |
| `compute_eligible_contracts(df, cfg)` | frame | `list[EligibleContractDTO]` (includes verified lot size/quote basis + rejection reason) | same |
| `compute_spreads(df, cfg, symbol)` | frame | observation list + rejections | `DataQualityError` when no tradable pair |
| `compute_zscores(sf, cfg)` | spread frame | `list[ZScorePointDTO]` (causal mean/std/z) | - |
| `run_strategy_backtest(df, cfg, symbol)` | frame + config | `BacktestReportDTO` (signals with `no_trade_reason`, trades, gross AND net metrics, walk-forward comparison, verdict, `is_valid_backtest`) | same |

Error contract: `QuantAPIError.to_json() -> {error_code, message, details}`; codes:
`invalid_input_schema`, `data_quality_rejected`.

DTOs serialize via `.to_json_dict()` (dataclass → plain JSON, timestamps →
`YYYY-MM-DD`, NaN → `null`). `SignalDTO.no_trade_reason` is filled for every
NO TRADE so the existing app can render rejections without importing quant
internals.

Historicity guarantee: every report carries `data_provenance`; `is_valid_backtest`
is True only with ≥ 30 spread observations — otherwise metrics are labeled
`diagnostics_only` and the verdict says explicitly which minimum failed.
