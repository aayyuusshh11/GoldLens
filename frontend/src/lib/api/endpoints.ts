import type {
  BacktestRunDTO,
  BacktestRunRequestDTO,
  ContractsResponseDTO,
  DataQualityReportDTO,
  HealthDTO,
  PairHistoryDTO,
  PairsResponseDTO,
  SignalAnalyzeDTO,
  SignalAnalyzeRequestDTO,
} from "../../types/api";
import { buildQuery, HttpClient } from "./client";
import {
  parseBacktestRun,
  parseContractsResponse,
  parseDataQualityReport,
  parseHealth,
  parsePairHistory,
  parsePairsResponse,
  parseSignalAnalyze,
} from "./parse";

/**
 * Confirmed endpoint client for the settled GoldLens data API
 * (backend branch: backend/app/api/routers/*, docs/API_CONTRACT.md).
 *
 * Routes (all under /api):
 *   GET  /api/health                    → HealthDTO
 *   GET  /api/contracts                 → ContractsResponseDTO (symbol/limit/offset)
 *   GET  /api/pairs                     → PairsResponseDTO (symbol)
 *   GET  /api/pairs/{pair_id}/history   → PairHistoryDTO
 *   POST /api/signals/analyze           → SignalAnalyzeDTO
 *   POST /api/backtests/run             → BacktestRunDTO
 *   GET  /api/data-quality              → DataQualityReportDTO
 *
 * POST /api/ingest is an internal backend utility — deliberately NOT exposed
 * here: the frontend never writes data (contract §8: "not for frontend").
 *
 * An empty base URL is legal → same-origin requests (vite dev proxy), see config.
 */
export interface ContractQuery {
  symbol?: string;
  limit?: number;
  offset?: number;
}

export interface GoldLensApi {
  readonly health: () => Promise<HealthDTO>;
  readonly contracts: (query: ContractQuery | undefined, signal?: AbortSignal) => Promise<ContractsResponseDTO>;
  readonly pairs: (symbol: string | undefined, signal?: AbortSignal) => Promise<PairsResponseDTO>;
  readonly pairHistory: (pairId: string, signal?: AbortSignal) => Promise<PairHistoryDTO>;
  readonly analyzeSignal: (request: SignalAnalyzeRequestDTO, signal?: AbortSignal) => Promise<SignalAnalyzeDTO>;
  readonly runBacktest: (request: BacktestRunRequestDTO, signal?: AbortSignal) => Promise<BacktestRunDTO>;
  readonly dataQuality: (signal?: AbortSignal) => Promise<DataQualityReportDTO>;
}

export function createGoldLensApi(baseUrl: string): GoldLensApi {
  const client = new HttpClient(baseUrl);
  return {
    async health(): Promise<HealthDTO> {
      return client.getJson("/api/health", parseHealth);
    },
    async contracts(query, signal): Promise<ContractsResponseDTO> {
      const q = query ?? {};
      return client.getJson(
        `/api/contracts${buildQuery({ symbol: q.symbol, limit: q.limit, offset: q.offset })}`,
        parseContractsResponse,
        signal ? { signal } : {},
      );
    },
    async pairs(symbol, signal): Promise<PairsResponseDTO> {
      return client.getJson(
        `/api/pairs${buildQuery({ symbol })}`,
        parsePairsResponse,
        signal ? { signal } : {},
      );
    },
    async pairHistory(pairId, signal): Promise<PairHistoryDTO> {
      return client.getJson(
        `/api/pairs${buildQuery({})}/${encodeURIComponent(pairId)}/history`,
        parsePairHistory,
        signal ? { signal } : {},
      );
    },
    async analyzeSignal(request, signal): Promise<SignalAnalyzeDTO> {
      return client.postJson(
        "/api/signals/analyze",
        {
          pair_id: request.pair_id,
          ...(request.as_of_date ? { as_of_date: request.as_of_date } : {}),
        },
        parseSignalAnalyze,
        signal ? { signal } : {},
      );
    },
    async runBacktest(request, signal): Promise<BacktestRunDTO> {
      return client.postJson(
        "/api/backtests/run",
        {
          pair_id: request.pair_id,
          ...(request.start_date ? { start_date: request.start_date } : {}),
          ...(request.end_date ? { end_date: request.end_date } : {}),
          ...(request.strategy_version ? { strategy_version: request.strategy_version } : {}),
        },
        parseBacktestRun,
        signal ? { signal } : {},
      );
    },
    async dataQuality(signal): Promise<DataQualityReportDTO> {
      return client.getJson(
        "/api/data-quality",
        parseDataQualityReport,
        signal ? { signal } : {},
      );
    },
  };
}
