/**
 * Presentation-level derivations over an already-serialized report.
 *
 * Rules (docs/METHODOLOGY.md + SKILLS.md):
 *  - only counting/labeling over values the backend already produced;
 *  - no recomputation of spreads, z-scores, signals or P&L;
 *  - nulls stay null; "missing" and "zero" stay distinct.
 */
import type {
  BacktestReportDTO,
  EligibleContractDTO,
  MetricsDTO,
  SignalDTO,
  SpreadObservationDTO,
  ZScorePointDTO,
} from "../types/api";
import { formatDateShort, isoToEpochDays } from "./formatters/format";

/** Display threshold only — mirrors CAMPAIGN_MIN_DAYS = 30 in reference/quant/api.py. */
export const VALIDITY_GATE_MIN_OBSERVATIONS = 30;

export function costsNotConfigured(report: BacktestReportDTO): boolean {
  const costs = report.config?.costs;
  if (costs === null || costs === undefined || costs === "") return true;
  return /not configured/i.test(costs);
}

/**
 * Reason text for withheld net metrics, or null when net metrics may be shown.
 * Wording follows metrics.costs_assumption / metrics.notes from the boundary;
 * the UI only picks which explanation to render.
 */
export function netWithheldReason(
  report: BacktestReportDTO,
  metrics: MetricsDTO | null,
): string | null {
  if (costsNotConfigured(report)) {
    return "Net metrics are withheld — transaction costs are not configured (see config.costs / metrics.costs_assumption). Gross-only figures must not be read as expected performance.";
  }
  if (metrics !== null && metrics.net_pnl_rupees === null && metrics.n_trades > 0) {
    return "Net metrics are withheld although costs appear configured — see metrics.notes for the pipeline's explanation.";
  }
  return null;
}

export function metricsStatusLabel(metrics: MetricsDTO | null): string {
  if (metrics === null) return "No metrics block in this report";
  if (metrics.status === "diagnostics_only") return "Diagnostics only";
  if (metrics.status === "backtest") return "Backtest";
  return `Status: ${metrics.status}`;
}

export interface ParsedSpecCheck {
  text: string;
  ok: boolean;
}

/** "PASS close within verified lot tolerance" → {ok:true}; "FAIL …" → {ok:false}. */
export function parseSpecChecks(specChecks: string[]): ParsedSpecCheck[] {
  return specChecks.map((text) => ({
    text,
    ok: text.trimStart().startsWith("PASS"),
  }));
}

export function countStale(observations: SpreadObservationDTO[]): number {
  return observations.filter((o) => o.stale).length;
}

export interface EligibleCounts {
  eligible: number;
  rejected: number;
  verifiedSpec: number;
}

export function eligibleCounts(contracts: EligibleContractDTO[]): EligibleCounts {
  let eligible = 0;
  let verifiedSpec = 0;
  for (const contract of contracts) {
    if (contract.eligible) eligible += 1;
    if (contract.lot_size_g !== null && contract.quote_basis_g !== null) verifiedSpec += 1;
  }
  return { eligible, rejected: contracts.length - eligible, verifiedSpec };
}

export function hasAnyNonNullZ(points: ZScorePointDTO[]): boolean {
  return points.some((p) => p.z !== null);
}

/** Last element of an ordered series (chronological as returned by the API). */
export function last<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[items.length - 1];
}

export function latestSignal(signals: SignalDTO[]): SignalDTO | undefined {
  return last(signals);
}

export function signalLabelCounts(signals: SignalDTO[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    counts.set(signal.signal, (counts.get(signal.signal) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

/** Calendar gaps > 1 day between consecutive plotted sessions (weekends/holidays). */
export function gapDaysCount(dates: string[]): number {
  let gaps = 0;
  for (let i = 1; i < dates.length; i += 1) {
    const prev = dates[i - 1];
    const curr = dates[i];
    const a = prev !== undefined ? isoToEpochDays(prev) : null;
    const b = curr !== undefined ? isoToEpochDays(curr) : null;
    if (a === null || b === null) continue;
    if (b - a > 1) gaps += 1;
  }
  return gaps;
}

/** ["2026-10-16","2026-11-05"] → "16 Oct 2026 — 5 Nov 2026"; single → "(single session)". */
export function dateRangeLabel(dateRange: string[]): string {
  const first = dateRange[0];
  const second = dateRange[1];
  if (first === undefined && second === undefined) return "Not available";
  if (first !== undefined && second !== undefined && first !== second) {
    return `${formatDateShort(first)} — ${formatDateShort(second)}`;
  }
  if (first !== undefined) return `${formatDateShort(first)} (single session)`;
  return formatDateShort(second ?? "");
}
