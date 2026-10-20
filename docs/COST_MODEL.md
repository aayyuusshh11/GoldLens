# Transaction Cost Model — provenance table

Rule: **any number that cannot be traced to a verifiable source (statute,
exchange circular, broker contract note) stays `unverified`, and net P&L is
intentionally withheld rather than computed with guessed inputs.**

`CostInput` (`quant/config.py`) — per-side, per-contract:

| Field | Status | Value / Source |
|---|---|---|
| `brokerage_rupees_per_lot` | **UNVERIFIED** | Broker-specific. Contract note or broker rate card required. Common retail range exists but is NOT adopted as default. |
| `exchange_transaction_rupees_per_lot` | **LEGACY / UNVERIFIED** | Fixed per-lot field retained for backward compatibility. Superseded by `exchange_transaction_bps_on_turnover` for post-Oct-2024 trades. |
| `exchange_transaction_bps_on_turnover` | **VERIFIED** | **Rs 2.10 per lakh of turnover = 0.0021%**, applied to both buy and sell sides. Source: MCX circular implementing SEBI Circular No. SEBI/HO/MRD/TPD-1/P/CIR/2024/92 ("True-to-Label" uniform fee structure), issued 1 Jul 2024, **effective 1 Oct 2024**. GST at 18% levied on top of the exchange transaction charge. |
| `stamp_duty_bps_on_turnover` | **LEGACY / SUPERSEDED** | Legacy both-sides stamp duty field. Kept for backward compatibility. Overridden by `stamp_duty_buy_side_bps_on_turnover` when non-None. |
| `stamp_duty_buy_side_bps_on_turnover` | **VERIFIED** | **0.002% (0.2 bps) on the BUY side's trade value only.** Source: Indian Stamp (Collection of Stamp-Duty through Stock Exchanges, Clearing Corporations and Depositories) Rules 2019, **effective 1 Jul 2020** (Finance Act 2019 amendment to Indian Stamp Act 1899 §9A). Exchange acts as collecting agent; remits to buyer's state government. **Buy side only** — sell side is not charged. |
| `gst_rate_on_transaction_charges` | **VERIFIED** | 18% on exchange transaction charges (statutory GST treatment of exchange fees). Engine applies per event. |
| `slippage_ticks` | **UNVERIFIED** | Execution-policy parameter. Baseline 0.0 is a conspicuous assumption, not evidence; replace with measured slippage from your broker's fill data or a stated policy. |
| `tick_size_rupees_per_quote_unit` | **VERIFIED** | MCX bullion contracts tick in ₹1 per quote unit (₹/10 g for GOLD/GOLDM). Engine charges slippage in quote units × rvalue × lots. |
| `ctt_bps_on_sell_turnover` | **VERIFIED (statutory)** | 0.01% = 1 bps on the SELL side's trade value for non-agricultural commodity futures. Sources: Finance Act 2013 §117 (commodities-transaction-tax table; in-force version effective 1 Apr 2018 lists "Sale of commodity derivative — 0.01% — seller"); MCX CTT page (rate effective 1 Jul 2013); MCXCCL collection procedure (sell transactions aggregated per client code each day, valued at traded price). GOLD/GOLDM bullion is a non-agri commodity → taxable. Pre-1-Jul-2013 windows are exempt; that is why the default is `None`, not 1.0. |

## Cost verification status summary (Pass 10)

| Charge | Status | Effective Date |
|---|---|---|
| Exchange transaction charge (turnover-based) | **VERIFIED** | 1 Oct 2024 (SEBI/HO/MRD/TPD-1/P/CIR/2024/92) |
| Stamp duty (buy-side only) | **VERIFIED** | 1 Jul 2020 (Indian Stamp Rules 2019 / Finance Act 2019) |
| GST on exchange transaction charges | **VERIFIED** | Statutory — 18% |
| CTT (sell-side, non-agri futures) | **VERIFIED** | 1 Jul 2013 (Finance Act 2013 §117) |
| Tick size (Rs 1 / quote unit) | **VERIFIED** | MCX bullion contract spec |
| Brokerage | **UNVERIFIED** | Broker-specific; contract note required |
| Slippage | **UNVERIFIED** | Execution data from broker fills required |

**Net P&L verdict:** Still withheld. Brokerage remains unverified. A valid net
P&L figure requires every cost input to be sourced from a verified contract
note, circular, or statute. Exchange transaction charges and stamp duty have
been verified and modelled correctly; brokerage and slippage still require
trader-supplied values.

## CTT engine mechanics

- `CostInput.ctt_bps_on_sell_turnover` — `None` ⇒ not configured: every
  backtest summary carries a `ctt_status` diagnostic saying net figures are
  **understated/incomplete**. `0.0` means the caller explicitly claims an
  exempt window; anything else is the bps rate.
- The charge applies only to the **sold leg's trade value**
  (leg_price × rvalue × lots). Side mapping in `quant/engine.py`:
  - entry LONG spread → buy far / **sell near**
  - entry SHORT spread → sell far / buy near
  - exit flips the sold leg: LONG closes by selling **far**; SHORT closes by
    selling **near**
- Blackout rule: if a trade event executes on a session whose leg quotes are
  missing, the CTT term is skipped for that event and counted in
  `diagnostics["ctt_events_skipped_missing_quote"]` (no silent zero).

## Exchange transaction charge mechanics (Pass 10)

- Rate: Rs 2.10 per lakh of turnover = **0.0021%** of leg trade value.
- Applied to **both** buy and sell sides at every execution event.
- GST at 18% is levied on the exchange transaction charge.
- Engine uses `CostInput.exchange_transaction_bps_on_turnover` when non-None
  (takes priority over legacy `exchange_transaction_rupees_per_lot`).
- The legacy field remains for backward compatibility with tests that pre-date
  the SEBI uniform-fee circular.

## Stamp duty mechanics (Pass 10)

- Rate: **0.002% (0.2 bps)** of the buying leg's trade value.
- Applied **only to the BUY side** of each execution event (one of the two
  legs per spread event).
- Buy/sell leg mapping mirrors the CTT logic (LONG entry buys FAR;
  SHORT entry buys NEAR; exits flip).
- Engine uses `CostInput.stamp_duty_buy_side_bps_on_turnover` when non-None
  (takes priority over legacy `stamp_duty_bps_on_turnover` which charged both
  sides incorrectly).

## End-to-end cost event formula (per leg)

```
cost(leg_event) =
    brokerage_per_lot × lots
  + exchange_txn_bps/1e4 × leg_value        (OR: exchange_txn_per_lot × lots)
  + exchange_txn × gst_rate                  (GST on exchange txn only)
  + stamp_buy_bps/1e4 × leg_value            (buy side only, OR: stamp_bps × both)
  + ctt_bps/1e4 × sold_leg_value             (once per event, sell side only)
  + slippage_ticks × tick_rupees × rvalue × lots
```

Per-event total = far_leg_cost + near_leg_cost.
Hand-calculated tests: `tests/test_cost_model_ctt.py`
(unit formula + full event reconciliation + backward-compat verification).

## Remaining unverified inputs

1. **Brokerage**: Broker-specific. Obtain from broker's rate card or a past
   contract note. Required before net P&L can be published.
2. **Slippage**: Execution-policy assumption. Measure from broker fill data
   or state an explicit policy (e.g. "1 tick half-spread assumption").

Until both are supplied, `cfg.costs` should remain `None` or be explicitly
flagged as an incomplete configuration. The engine refuses net P&L in either
case.

## Compliance note

CTT is statutory and applies regardless of profit; long/short treatment
sells one leg at every event. Spending effort to avoid the tax modelling is
not an option/facility: only the rate schedule and configuration are
discussed. Nothing here encourages evasion — if unsure, consult a tax
professional; rate schedules do change (the options-CTT entry appeared by
Finance (No.2) Act 2024 / Apr-2025 effective revision).
