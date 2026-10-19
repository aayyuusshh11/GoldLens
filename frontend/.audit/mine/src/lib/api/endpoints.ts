/**
 * Typed endpoint functions — Phase 3.
 *
 * ⚠️ EVERY function here targets a PROPOSED route (docs/API_CONTRACT.md §1).
 * No FastAPI server exists in this repository. These functions DO NOT assert
 * that any endpoint works; pages probe them defensively and must render an
 * explicit backend-not-connected / endpoint-not-implemented state on failure.
 * When the backend ships, verify real route paths + response models against
 * this module before flipping any UI to "live".
 */
import { HttpJson } from "./client";
import { ROUTE_PREFIX, resolveBaseUrl } from "./config";
import type {
  BacktestConfig,
  BacktestReportDTO,
  DataQualityResponse,
  EligibleContractDTO,
  HealthResponse,
  PairHistoryResponse,
  PairSummaryDTO,
  SignalAnalyzeResponse,
} from "./types";

export interface ClientOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function createApiClient(baseUrl: string = resolveBaseUrl(import.meta.env.VITE_API_BASE_URL)) {
  const http = new HttpJson(baseUrl);
  const p = ROUTE_PREFIX;

  return {
    baseUrl,
    http,

    /** PROPOSED `GET /api/health` — liveness only; payload shape unconfirmed. */
    getHealth(options?: ClientOptions) {
      return http.getJson<HealthResponse>(`${p}/health`, options);
    },

    /** PROPOSED `GET /api/contracts` — latest-day eligibility snapshot (large). */
    getContracts(options?: ClientOptions) {
      return http.getJson<EligibleContractDTO[]>(`${p}/contracts`, options);
    },

    /** PROPOSED `GET /api/pairs` — tradable calendar pairs. */
    getPairs(options?: ClientOptions) {
      return http.getJson<PairSummaryDTO[]>(`${p}/pairs`, options);
    },

    /** PROPOSED `GET /api/pairs/{pair_id}/history` — spread + z series. */
    getPairHistory(pairId: string, options?: ClientOptions & Record<string, unknown>) {
      return http.getJson<PairHistoryResponse>(`${p}/pairs/${encodeURIComponent(pairId)}/history`, options);
    },

    /** PROPOSED `POST /api/signals/analyze` — latest-day decision. */
    analyzeSignals(
      body: { symbol?: string; config?: Partial<BacktestConfig> } = {},
      options?: ClientOptions,
    ) {
      return http.postJson<SignalAnalyzeResponse>(`${p}/signals/analyze`, body, options);
    },

    /** PROPOSED `POST /api/backtests/run` — full BacktestReportDTO. */
    runBacktest(body: BacktestConfig, options?: ClientOptions) {
      return http.postJson<BacktestReportDTO>(`${p}/backtests/run`, body, options);
    },

    /** PROPOSED `GET /api/data-quality` — provenance + quality findings. */
    getDataQuality(options?: ClientOptions) {
      return http.getJson<DataQualityResponse>(`${p}/data-quality`, options);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
