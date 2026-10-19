# SKILLS.md — GoldLens Frontend Quality Contract

Mandatory for any AI coding agent touching the UI. Read `README.md` and `docs/` first.

## Visual goal

A premium, restrained research terminal: graphite surfaces, muted gold accent, sharp typography, strong hierarchy, clear numbers and useful charts. It should feel like a real analytical tool, not a generic AI dashboard assembled from rounded rectangles.

Starting palette:
- Background `#0B0D10`
- Surface `#12161B`
- Elevated surface `#191F26`
- Border `#2A313A`
- Primary text `#F3F4F6`
- Muted text `#9CA3AF`
- Gold accent `#C7A45B`
- Positive `#35B887`
- Negative `#E16D72`
- Warning `#E5B45B`

Verify contrast in the actual implementation. Use tabular numerals for price and performance values. Use one consistent icon set such as Lucide.

## Ban these patterns

- Giant gradient headline, floating blobs, gratuitous glow, glassmorphism.
- Six identical KPI cards with huge numbers and no explanation.
- Fake live badges, fake market data, invented win rates or fabricated performance.
- Charts without labels, units, date range, legend/tooltips or data-source context.
- Putting every element inside a card just because cards exist.
- Emojis as UI icons, decorative animations, meaningless gradients.
- Generic copy like “Unlock insights” or “AI-powered revolution.”
- Dead buttons, decorative toggles, fake dropdowns and fake export controls.
- Treating the supplied one-day sample as a real-time feed or validated backtest.

## Information architecture

1. Overview
2. Pair Explorer
3. Signal Forensics
4. Backtest
5. Eligible Contracts
6. Data Quality

Core journey: inspect data quality → select GOLD/GOLDM family when available → view near/far expiry spread → inspect rolling z-score → read signal rationale and filters → inspect trades/metrics → review validity and cost warnings.

## Use the real DTOs

The quant boundary serializes a `BacktestReportDTO` with these top-level keys:
`config`, `data_provenance`, `pair`, `spread_observations`, `z_score`, `signals`, `trades`, `eligible_contracts`, `metrics`, `train_metrics`, `test_metrics`, `walk_forward_cmp`, `verdict`, `is_valid_backtest`.

Use the field names as defined in `docs/API_CONTRACT.md`. Do not silently rename fields or assume all values are non-null.

## Metric and state requirements

- Display `verdict` and `is_valid_backtest` prominently on the Backtest screen.
- When `metrics.status === "diagnostics_only"`, label results as diagnostics.
- If `metrics.net_pnl_rupees` is null or `costs_assumption` says costs are not supplied, do not display a net P&L number.
- If z-score is null, explain insufficient history or unavailable rolling statistics rather than rendering zero.
- Show signal text and `rationale`, `filter_reason`, `filters_ok`, and `no_trade_reason`.
- Render `stale` observations distinctly.
- Eligible contracts must show the `eligible` flag and `reason`; never hide rejected contracts without a filter/expand affordance.
- Preserve `null` values as “Unavailable” or “Not computed,” not zero.
- Distinguish data provenance date range from current wall-clock time.

## Chart standards

- Label axes with units, dates and the exact price field.
- Keep near/far series colors consistent across screens.
- The spread chart must explain its sign convention.
- Z-score chart must show lookback and threshold values from `config`, when returned.
- Show data gaps and stale points; do not silently interpolate.
- Include helpful tooltips, legend, range context and accessible labels.
- A chart should answer one specific question.

## Layout and interaction

- Desktop-first for the demo; intentionally adapt at tablet/mobile widths.
- Use a consistent gutter and spacing scale; avoid over-dense text.
- Numeric table columns align consistently and use tabular numerals.
- Every button does something. Every input has a label, validation and useful error state.
- Visible keyboard focus; semantic HTML; no color-only pass/fail cues.
- Handle loading, empty, API error, partial data, stale data and diagnostics-only states.
- Respect reduced-motion preferences.
- Keep business logic out of presentation components; strict TypeScript, no casual `any`.

## Before declaring done

1. Run production build and available tests.
2. Check a normal report and the provided one-day sample.
3. Verify null metrics and `is_valid_backtest: false` render correctly.
4. Test all navigation, filters, controls and error states.
5. Check responsive layout, chart units and keyboard focus.
6. Report commands actually run and defects still open. Never claim tests you did not execute.
