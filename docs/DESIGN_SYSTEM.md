# GoldLens Design System

## Direction
Premium research terminal: graphite, muted gold, disciplined typography, strong hierarchy, restrained borders and highly legible charting.

## Palette
- Background `#0B0D10`
- Surface `#12161B`
- Elevated surface `#191F26`
- Border `#2A313A`
- Text `#F3F4F6`
- Muted `#9CA3AF`
- Gold `#C7A45B`
- Positive `#35B887`
- Negative `#E16D72`
- Warning `#E5B45B`

Check contrast and semantic colors. Do not color every button gold.

## Typography and layout
- Inter or Geist; tabular numerals for financial values.
- Consistent 4/8 spacing rhythm; modest 8–12px radii.
- Use dividers and whitespace instead of cards around everything.
- Keep titles compact and reserve space for analysis.
- Tables must align numeric columns and handle overflow intentionally.

## Required components
`AppShell`, `PageHeader`, `MetricValue`, `StatusBadge`, `DataQualityNotice`, `ChartPanel`, `SpreadChart`, `ZScoreChart`, `SignalDecisionPanel`, `ReasonList`, `BacktestMetrics`, `EligibleContractsTable`, `LoadingState`, `EmptyState`, `ErrorState`.

## Charts
Every chart needs a question, title, axis units, date range, tooltip and legend as relevant. Distinguish near/far expiries consistently. Show stale points and missing data. Z-score threshold lines must be labeled and sourced from config. Never draw null z-scores as zero.

## Status states
Loading, empty, API failure, partial data, stale observation, insufficient history, diagnostics-only result, valid backtest and synthetic fixture must look different and have readable text labels.

## Interaction
No dead controls. Keyboard focus visible. Labels and validation for inputs. Responsive layout should be intentionally redesigned on small screens. Motion should be subtle and respect reduced-motion preferences.
