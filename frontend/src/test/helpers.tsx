import fixtureJson from "../lib/api/fixtures/api_contract_sample.json";
import { parseBacktestReport } from "../lib/api/parse";
import type { BacktestReportDTO } from "../types/api";

/**
 * Shared fixture access. The bundled sample goes through the same strict
 * runtime validator as live responses, so corrupt fixtures fail every test
 * loudly instead of passing silently.
 */
export function sampleReport(): BacktestReportDTO {
  return parseBacktestReport(fixtureJson);
}

export { fixtureJson };
