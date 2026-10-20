# MCX Data Quality Report

Generated: 2026-10-20T16:04:16Z — values are measured, never guessed.

## Files ingested (SHA-256)

| File | SHA-256 |
|---|---|
| `D:\HACKthon\HillToHill\GOLD\BhavCopyDateWise_16102026 (2).csv` | `97fb1028bca988d13ecf47895253feb9537c6700f6cd09ce4927d9b623f9a53e` |
| `D:\HACKthon\HillToHill\GOLD\BhavCopyDateWise_16102026.csv` | `74a1e5a66faad9e8aa6d71210be9cc653a2e9672a733ba1c1107539171d5ef66` |
| `D:\HACKthon\HillToHill\GOLD\data\raw\mcx\BhavCopyDateWise_19102026.csv` | `f5ae9c5a32c163c3116f3db0d442a06c8aedb43476f1249126840509e138263c` |

## Row-level checks (post-cleaning)

| Check | Result |
|---|---|
| duplicate_keys | 0 |
| blank_close | 0 |
| price_consistency | 0 |
| nonpositive_volumes | 0 |
| missing_oi | 0 |
| unparsed_expiry | 0 |
| expired_contracts | 0 |
| distinct_trade_dates | 2 |
| largest_calendar_gap_days | 3 |
| trade_date_continuity | 2 distinct date(s); gaps are expected over weekends/holidays and are NOT inferred here (weekend sessions possible on MCX) |
| duplicate_sha_files | 0 |

## Trade dates

2026-10-16, 2026-10-19

## Symbols present

ALUMINI, ALUMINIUM, CARDAMOM, COPPER, COTTON, COTTONOIL, CRUDEOIL, CRUDEOILM, ELECDMBL, GOLD, GOLDGUINEA, GOLDM, GOLDPETAL, GOLDTEN, KAPAS, LEAD, LEADMINI, MENTHAOIL, NATGASMINI, NATURALGAS, NICKEL, SILVER, SILVER100, SILVERM, SILVERMIC, STEELREBAR, SUNOIL, ZINC, ZINCMINI

## Backtest eligibility

A valid spread backtest needs at least 30 eligible spread observations (~100+ for walk-forward). This dataset does not meet that minimum.

## Quarantined payloads

0 record(s).
