/**
 * Report analysis adapter — Phase 3 ("Frontend integration checklist").
 *
 * This is the ONLY place allowed to derive presentation state from a report,
 * and even then derivation is limited to: counting, locating verbatim backend
 * statements, and parsing the documented PASS/FAIL prefix. The adapter never
 * computes new quant numbers and never flips a diagnostic-only report to valid.
 */
import type {
  BacktestReportDTO,
  DataProvenance,
  MetricsDTO,
  SpreadPointDTO,
} from "@/lib/api/types";

/** Floor from `api.py` CAMPAIGN_MIN_DAYS; exact combo with cfg.min_test_days pending owner (B9-adjacent). */
export const VALIDITY_GATE_MIN_OBSERVATIONS = 30;

export function isDiagnosticsOnly(report: BacktestReportDTO): boolean {
  if (report.metrics) return report.metrics.status === "diagnostics_only";
  return !report.is_valid_backtest;
}

/** Number of observations flagged stale by the pipeline (rendered, never smoothed). */
export function countStale(observations: readonly SpreadPointDTO[]): number {
  return observations.reduce((sum, o) => sum + (o.stale ? 1 : 0), 0);
}

/** Calendar gaps > 1 day between sorted ISO dates (weekends/holidays — not interpolated, only reported). */
export function gapDaysCount(isoDates: readonly string[]): number {
  const sorted = [...isoDates].filter(Boolean).sort();
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (plainDateUtc(sorted[i - 1]!) + ONE_DAY !== plainDateUtc(sorted[i]!)) gaps++;
  }
  return gaps;
}

const ONE_DAY = 86_400_000;
function plainDateUtc(iso: string): number {
  // Parses "YYYY-MM-DD" without timezone influence.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.slice(0, 10));
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Parse verbatim PASS/FAIL spec-check strings; unknown prefixes surface as "unparsed". */
export function parseSpecChecks(raw: readonly string[] | undefined):
  Array<{ ok: boolean; text: string; unparsed?: boolean }> {
  if (!raw) return [];
  return raw.map((text) => {
    if (text.startsWith("PASS ")) return { ok: true, text: text.slice(5) };
    if (text.startsWith("FAIL ")) return { ok: false, text: text.slice(5) };
    return { ok: false, text, unparsed: true };
  });
}

/** Reasons the backend itself gave for withholding net metrics (verbatim notes only). */
export function withheldNetReasons(metrics: MetricsDTO | null): string[] {
  if (!metrics) return [];
  const result: string[] = [];
  for (const note of metrics.notes) {
    if (
      /Net P&L withheld/i.test(note) ||
      /costs not configured/i.test(note) ||
      note === "costs_not_configured"
    ) {
      result.push(note);
    }
  }
  return result;
}

/** Human-facing coverage summary strictly from provenance fields. */
export function provenanceRows(provenance: DataProvenance): Array<[string, string]> {
  return [
    ["Distinct trading days", String(provenance.trading_days)],
    ["Session range", provenance.date_range.slice(0, 2).join(" – ")],
    ["Spec cross-checks", provenance.spec_checks?.length ? `${provenance.spec_checks.length} reported` : "none reported"],
  ];
}
