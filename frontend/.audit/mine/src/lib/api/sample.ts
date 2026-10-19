/**
 * Sample report (opt-in demo data) — Phase 3.
 *
 * `api_contract_sample.json` is a supplied EXAMPLE payload — NOT live data.
 * It contains exactly one trading day (2026-10-16), no trades, a null z-score
 * (insufficient history), unconfigured costs, status "diagnostics_only",
 * and is_valid_backtest = false.
 *
 * RULES: any page rendering this payload must keep a persistent
 * "Sample report — not live data" notice. It must never be mixed with live
 * API state, and never presented as valid/current data.
 */
import sampleJson from "./sample/api_contract_sample.json";
import type { BacktestReportDTO } from "./types";

export const SAMPLE_REPORT = sampleJson as BacktestReportDTO;

/** Mandatory label wherever the sample is rendered. */
export const SAMPLE_REPORT_LABEL =
  "Sample report — not live data; one trading day (2026-10-16); not a valid backtest";

/** The supplied sample's own verdict string (rendered verbatim, not paraphrased). */
export function samplePreviewSummary(): string {
  return SAMPLE_REPORT.verdict;
}
