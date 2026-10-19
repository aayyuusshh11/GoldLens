import type { BacktestReportDTO, ReportSymbol } from "../../types/api";
import { buildQuery, HttpClient } from "./client";
import { parseBacktestReport, parseHealth, type HealthDTO } from "./parse";

/**
 * Confirmed/pending report endpoints. Per docs/API_CONTRACT.md v1, every route
 * here is still a PROPOSAL — the quant boundary is a Python module and no
 * FastAPI app exists yet. The live paths match the draft contract so the
 * client works the moment the backend ships. See docs/INTEGRATION_BLOCKERS.md.
 */

export interface GoldLensApi {
  readonly health: () => Promise<HealthDTO>;
  readonly report: (symbol: ReportSymbol, signal?: AbortSignal) => Promise<BacktestReportDTO>;
}

export function createGoldLensApi(baseUrl: string): GoldLensApi {
  const client = new HttpClient(baseUrl);
  return {
    async health() {
      return client.getJson("/health", parseHealth);
    },
    async report(symbol, signal) {
      return client.getJson(`/report${buildQuery({ symbol })}`, parseBacktestReport, signal ? { signal } : {});
    },
  };
}
