import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  BacktestRunDTO,
  BacktestRunRequestDTO,
  ContractsResponseDTO,
  DataQualityReportDTO,
  HealthDTO,
  PairHistoryDTO,
  PairSummaryDTO,
  PairsResponseDTO,
  SignalAnalyzeDTO,
} from "../types/api";
import type { AppError } from "../lib/api/errors";
import { ApiRequestError, describeError } from "../lib/api/errors";
import { appConfig, type AppConfig, type DataMode } from "../lib/api/config";
import { createGoldLensApi, type GoldLensApi } from "../lib/api/endpoints";
import {
  FIXTURE_SYMBOLS,
  fixtureBacktestRun,
  fixtureContracts,
  fixtureDataQuality,
  fixtureHealth,
  fixturePairHistory,
  fixturePairs,
  fixtureSignalAnalyze,
} from "../lib/api/fixtures";

/**
 * App data layer for the settled 7-route API (Implementation.txt P9).
 *
 * - Independent slices: dq/contracts/pairs auto-load once (cheap GETs);
 *   history/signal/backtest are cached per pair key and load for the selected
 *   pair. Navigating never silently refetches cached data.
 * - In-flight requests abort per family on reload; generation counters guard
 *   every state write so stale responses cannot land.
 * - Failures are explicit state. There is NO fallback to fixture data in live
 *   mode — errors render, and user-initiated refreshes keep the last good
 *   data visible while a refresh is in flight (clearly labeled).
 * - Health is lightly probed (live mode only) for the header pill; it never
 *   gates rendering.
 * - In fixture mode the same resolvers serve the mirrored 1-day dataset — the
 *   UI renders a permanent fixture banner alongside real labels.
 * - POST /api/ingest is backend tooling and is deliberately not exposed here.
 */

// --------------------------------------------------------------------- //
// Slice state machine (store key = `${family}:${familyKey}`)
// --------------------------------------------------------------------- //

export interface Slice<T> {
  key: "idle" | "loading" | "ready" | "error";
  data: T | null;
  error: AppError | null;
  refreshing: boolean;
  fetchedAt: Date | null;
}

export type HealthState = { key: "checking" | "ok" | "down" | "fixture"; detail?: string };

function idleSlice<T>(): Slice<T> {
  return { key: "idle", data: null, error: null, refreshing: false, fetchedAt: null };
}

const FAMILY = {
  dq: "dq",
  contracts: "contracts",
  pairs: "pairs",
  history: "history",
  signal: "signal",
  backtest: "backtest",
} as const;

type Family = (typeof FAMILY)[keyof typeof FAMILY];

type SliceKey = string; // `${family}:${key}`
type SliceState = Record<SliceKey, Slice<unknown>>;

/**
 * Stable slice actions: load (with per-family abort + generation guard),
 * abort, and the shared cache. Identities never change, so effects that use
 * them stay fire-once (run/abort don't depend on state; `setEntries` is the
 * guaranteed-stable setState).
 */
function useSliceActions(setEntries: React.Dispatch<React.SetStateAction<SliceState>>) {
  const generations = useRef(new Map<string, number>());
  const controllers = useRef(new Map<string, AbortController>());
  const cache = useRef(new Map<SliceKey, { data: unknown; fetchedAt: Date }>());

  const run = useCallback(
    (
      family: Family,
      key: string,
      load: (signal: AbortSignal) => Promise<unknown>,
      options?: { refresh?: boolean },
    ): void => {
      const storeKey = `${family}:${key}`;
      controllers.current.get(family)?.abort();
      const gen = (generations.current.get(family) ?? 0) + 1;
      generations.current.set(family, gen);
      const controller = new AbortController();
      controllers.current.set(family, controller);
      const cached = cache.current.get(storeKey);

      const apply = (next: Slice<unknown>): void => {
        setEntries((current) => ({ ...current, [storeKey]: next }));
      };

      if (options?.refresh === true && cached !== undefined) {
        apply({ ...idleSlice(), key: "ready", data: cached.data, fetchedAt: cached.fetchedAt, refreshing: true });
      } else {
        apply({ ...idleSlice(), key: "loading", refreshing: options?.refresh === true });
      }

      const finish = async (): Promise<void> => {
        try {
          const data = await load(controller.signal);
          if (generations.current.get(family) !== gen) return;
          const fetchedAt = new Date();
          cache.current.set(storeKey, { data, fetchedAt });
          apply({ ...idleSlice(), key: "ready", data, fetchedAt, refreshing: false });
        } catch (error) {
          if (generations.current.get(family) !== gen) return;
          const appError = describeError(error);
          if (appError.code === "cancelled") return;
          const stale = cache.current.get(storeKey) ?? null;
          apply({
            ...idleSlice(),
            key: "error",
            error: appError,
            data: stale === null ? null : stale.data,
            refreshing: false,
          });
        }
      };
      void finish();
    },
    [],
  );

  const abortFamily = useCallback((family: Family): void => {
    controllers.current.get(family)?.abort();
  }, []);

  return useMemo(() => ({ run, abortFamily }), [run, abortFamily]);
}

// --------------------------------------------------------------------- //
// Context value + provider
// --------------------------------------------------------------------- //

export interface ApiContextValue {
  source: { mode: DataMode; config: AppConfig };
  health: HealthState;
  /** GET /api/data-quality (auto-load). */
  dq: Slice<DataQualityReportDTO>;
  refreshDq: () => void;
  /** GET /api/contracts (auto-load; symbol filtering happens on display). */
  contracts: Slice<ContractsResponseDTO>;
  refreshContracts: () => void;
  /** GET /api/pairs (auto-load; symbol filter applied on display). */
  pairs: Slice<PairsResponseDTO>;
  refreshPairs: () => void;
  /** Symbols observed in the current dataset (open set, never a closed enum). */
  symbols: string[];
  symbol: string;
  setSymbol: (next: string) => void;
  /** Pairs belonging to the selected symbol (client-side filter). */
  pairsForSymbol: PairSummaryDTO[];
  pairId: string | null;
  setPairId: (next: string | null) => void;
  selectedPair: PairSummaryDTO | null;
  /** GET history for the selected pair (cached per pair_id). */
  history: Slice<PairHistoryDTO>;
  refreshHistory: () => void;
  /** POST /api/signals/analyze for the selected pair (latest date, cached). */
  signal: Slice<SignalAnalyzeDTO>;
  refreshSignal: () => void;
  /** POST /api/backtests/run for the selected pair, default params (cached). */
  backtest: Slice<BacktestRunDTO>;
  refreshBacktest: () => void;
  /** Explicit re-run with user-supplied request parameters. */
  runBacktest: (request: BacktestRunRequestDTO) => void;
}

export const ApiContext = createContext<ApiContextValue | null>(null);

export function useApi(): ApiContextValue {
  const value = useContext(ApiContext);
  if (!value) throw new Error("useApi must be used inside <ApiProvider>");
  return value;
}

export function ApiProvider({
  children,
  config: configProp,
}: {
  children: ReactNode;
  /** Optional override — tests inject fixture/live config directly. */
  config?: AppConfig;
}) {
  const config = configProp ?? appConfig();
  const [entries, setEntries] = useState<SliceState>({});
  const actions = useSliceActions(setEntries);

  const [symbol, setSymbolState] = useState<string>(config.defaultSymbol);
  const [symbolSelectionLocked, setSymbolSelectionLocked] = useState(false);
  const [pairId, setPairIdState] = useState<string | null>(null);
  const [pairIdSeenFor, setPairIdSeenFor] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthState>(
    config.mode === "fixture" ? { key: "fixture" } : { key: "checking" },
  );

  const api = useMemo<GoldLensApi | null>(
    () => (config.mode === "live" && config.baseUrl !== null ? createGoldLensApi(config.baseUrl) : null),
    [config.mode, config.baseUrl],
  );

  const fixtureDelayMs = useCallback(
    async (signal: AbortSignal): Promise<void> => {
      await new Promise((resolve) => { setTimeout(resolve, config.fixtureDelayMs); });
      if (signal.aborted) throw new ApiRequestError({
        kind: "unknown",
        code: "cancelled",
        message: "Request cancelled",
        status: null,
        details: null,
      });
    },
    [config.fixtureDelayMs],
  );

  /* Fixture transport: same shapes, from the local resolver set. */
  const fixtureLoader = useMemo(() => {
    if (config.mode !== "fixture") return null;
    const notFound = (pairId?: string): ApiRequestError => new ApiRequestError({
      kind: "http",
      code: "not_found",
      message: "unknown pair_id format",
      status: 404,
      details: pairId === undefined ? {} : { pair_id: pairId },
    });
    return {
      health: async (signal: AbortSignal): Promise<HealthDTO> => {
        await fixtureDelayMs(signal);
        return fixtureHealth();
      },
      dq: async (signal: AbortSignal): Promise<DataQualityReportDTO> => {
        await fixtureDelayMs(signal);
        return fixtureDataQuality();
      },
      contracts: async (signal: AbortSignal): Promise<ContractsResponseDTO> => {
        await fixtureDelayMs(signal);
        return fixtureContracts();
      },
      pairs: async (signal: AbortSignal): Promise<PairsResponseDTO> => {
        await fixtureDelayMs(signal);
        return fixturePairs();
      },
      history: async (key: string, signal: AbortSignal): Promise<PairHistoryDTO> => {
        await fixtureDelayMs(signal);
        const result = fixturePairHistory(key);
        if (result === null) throw notFound(key); // mirrors backend 404
        return result;
      },
      signalAnalyze: async (key: string, signal: AbortSignal): Promise<SignalAnalyzeDTO> => {
        await fixtureDelayMs(signal);
        const result = fixtureSignalAnalyze({ pair_id: key });
        if (result === null) throw notFound(key);
        return result;
      },
      backtest: async (request: BacktestRunRequestDTO, signal: AbortSignal): Promise<BacktestRunDTO> => {
        await fixtureDelayMs(signal);
        const result = fixtureBacktestRun(request);
        if (result === null) throw notFound(request.pair_id);
        return result;
      },
    };
  }, [config.mode, fixtureDelayMs]);

  /* Health probe: live mode only, never gates rendering. */
  useEffect(() => {
    if (config.mode !== "live" || api === null) return;
    let cancelled = false;
    api
      .health()
      .then((h) => {
        if (cancelled) return;
        const detail =
          h.data_available === false
            ? `${h.service} — no observations stored (ingest the CSV)`
            : h.service;
        // "healthy" service with empty storage is still an UP backend.
        setHealth({ key: "ok", detail });
      })
      .catch((error) => {
        if (cancelled) return;
        setHealth({ key: "down", detail: describeError(error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [config.mode, api]);

  /* Auto-load on mount: dq + contracts + pairs. */
  useEffect(() => {
    const { run, abortFamily } = actions;
    if (api !== null) {
      run(FAMILY.dq, "default", (signal) => api.dataQuality(signal));
      run(FAMILY.contracts, "default", (signal) => api.contracts({ limit: 500, offset: 0 }, signal));
      run(FAMILY.pairs, "default", (signal) => api.pairs(undefined, signal));
    } else if (fixtureLoader !== null) {
      run(FAMILY.dq, "default", (signal) => fixtureLoader.dq(signal));
      run(FAMILY.contracts, "default", (signal) => fixtureLoader.contracts(signal));
      run(FAMILY.pairs, "default", (signal) => fixtureLoader.pairs(signal));
    }
    return () => {
      abortFamily(FAMILY.dq);
      abortFamily(FAMILY.contracts);
      abortFamily(FAMILY.pairs);
    };
  }, [api, fixtureLoader, actions]);

  /* Read slices straight from state each render (no memo identity games). */
  const dq = (entries[FAMILY.dq + ":default"] ?? idleSlice()) as Slice<DataQualityReportDTO>;
  const contracts = (entries[FAMILY.contracts + ":default"] ?? idleSlice()) as Slice<ContractsResponseDTO>;
  const pairs = (entries[FAMILY.pairs + ":default"] ?? idleSlice()) as Slice<PairsResponseDTO>;
  const history = (entries[FAMILY.history + ":" + (pairId ?? "")] ?? idleSlice()) as Slice<PairHistoryDTO>;
  const signal = (entries[FAMILY.signal + ":" + (pairId ?? "")] ?? idleSlice()) as Slice<SignalAnalyzeDTO>;
  const backtest = (entries[FAMILY.backtest + ":" + (pairId ?? "")] ?? idleSlice()) as Slice<BacktestRunDTO>;

  /* Symbols: open set from live data, or the fixture dataset. */
  const symbols = useMemo(() => {
    if (pairs.key === "ready" && pairs.data !== null) {
      return [...new Set(pairs.data.pairs.map((p) => p.symbol))].sort();
    }
    if (config.mode === "fixture") return [...FIXTURE_SYMBOLS];
    return [];
  }, [pairs, config.mode]);

  /* First-load symbol resolution: honor config, else first observed symbol. */
  useEffect(() => {
    if (symbols.length === 0 || symbolSelectionLocked) return;
    setSymbolSelectionLocked(true);
    if (!symbols.includes(symbol)) {
      const first = symbols[0];
      if (first !== undefined) setSymbolState(first);
    }
  }, [symbols, symbol, symbolSelectionLocked]);

  const pairsForSymbol = useMemo(() => {
    if (pairs.key !== "ready" || pairs.data === null || symbol === "") return [];
    return pairs.data.pairs.filter((p) => p.symbol === symbol);
  }, [pairs, symbol]);

  /* Pair auto-pick: keep a pair of the selected symbol selected. */
  useEffect(() => {
    if (pairsForSymbol.length === 0) return;
    if (pairId !== null && pairsForSymbol.some((p) => p.pair_id === pairId)) return;
    const first = pairsForSymbol[0];
    if (first !== undefined) setPairIdState(first.pair_id);
  }, [pairsForSymbol, pairId]);

  const selectedPair = useMemo(
    () => pairsForSymbol.find((p) => p.pair_id === pairId) ?? null,
    [pairsForSymbol, pairId],
  );

  /* Load history/signal/backtest for the selected pair (cached per pair_id). */
  useEffect(() => {
    if (pairId === null || pairIdSeenFor === pairId) return;
    setPairIdSeenFor(pairId);
    if (api !== null) {
      actions.run(FAMILY.history, pairId, (signal) => api.pairHistory(pairId, signal));
      actions.run(FAMILY.signal, pairId, (signal) => api.analyzeSignal({ pair_id: pairId }, signal));
      actions.run(FAMILY.backtest, pairId, (signal) => api.runBacktest({ pair_id: pairId }, signal));
    } else if (fixtureLoader !== null) {
      actions.run(FAMILY.history, pairId, (signal) => fixtureLoader.history(pairId, signal));
      actions.run(FAMILY.signal, pairId, (signal) => fixtureLoader.signalAnalyze(pairId, signal));
      const request: BacktestRunRequestDTO = { pair_id: pairId };
      actions.run(FAMILY.backtest, pairId, (signal) => fixtureLoader.backtest(request, signal));
    }
  }, [pairId, pairIdSeenFor, api, fixtureLoader, actions]);

  /* User-initiated refreshes: bypass cache, keep last good data visible. */
  const refreshDq = useCallback(() => {
    if (api !== null) actions.run(FAMILY.dq, "default", (signal) => api.dataQuality(signal), { refresh: true });
    else if (fixtureLoader !== null) {
      actions.run(FAMILY.dq, "default", (signal) => fixtureLoader.dq(signal), { refresh: true });
    }
  }, [api, fixtureLoader, actions]);
  const refreshContracts = useCallback(() => {
    if (api !== null) {
      actions.run(FAMILY.contracts, "default", (signal) => api.contracts({ limit: 500, offset: 0 }, signal), { refresh: true });
    } else if (fixtureLoader !== null) {
      actions.run(FAMILY.contracts, "default", (signal) => fixtureLoader.contracts(signal), { refresh: true });
    }
  }, [api, fixtureLoader, actions]);
  const refreshPairs = useCallback(() => {
    if (api !== null) actions.run(FAMILY.pairs, "default", (signal) => api.pairs(undefined, signal), { refresh: true });
    else if (fixtureLoader !== null) {
      actions.run(FAMILY.pairs, "default", (signal) => fixtureLoader.pairs(signal), { refresh: true });
    }
  }, [api, fixtureLoader, actions]);
  const refreshHistory = useCallback(() => {
    if (pairId === null) return;
    if (api !== null) actions.run(FAMILY.history, pairId, (signal) => api.pairHistory(pairId, signal), { refresh: true });
    else if (fixtureLoader !== null) {
      actions.run(FAMILY.history, pairId, (signal) => fixtureLoader.history(pairId, signal), { refresh: true });
    }
  }, [pairId, api, fixtureLoader, actions]);
  const refreshSignal = useCallback(() => {
    if (pairId === null) return;
    if (api !== null) actions.run(FAMILY.signal, pairId, (signal) => api.analyzeSignal({ pair_id: pairId }, signal), { refresh: true });
    else if (fixtureLoader !== null) {
      actions.run(FAMILY.signal, pairId, (signal) => fixtureLoader.signalAnalyze(pairId, signal), { refresh: true });
    }
  }, [pairId, api, fixtureLoader, actions]);
  const refreshBacktest = useCallback(() => {
    if (pairId === null) return;
    if (api !== null) actions.run(FAMILY.backtest, pairId, (signal) => api.runBacktest({ pair_id: pairId }, signal), { refresh: true });
    else if (fixtureLoader !== null) {
      const request: BacktestRunRequestDTO = { pair_id: pairId };
      actions.run(FAMILY.backtest, pairId, (signal) => fixtureLoader.backtest(request, signal), { refresh: true });
    }
  }, [pairId, api, fixtureLoader, actions]);

  /** Explicit re-run with user-supplied request parameters. */
  const runBacktest = useCallback(
    (request: BacktestRunRequestDTO) => {
      const key = `${request.pair_id}|${request.start_date ?? ""}|${request.end_date ?? ""}|${request.strategy_version ?? "default"}`;
      if (api !== null) actions.run(FAMILY.backtest, key, (signal) => api.runBacktest(request, signal));
      else if (fixtureLoader !== null) actions.run(FAMILY.backtest, key, (signal) => fixtureLoader.backtest(request, signal));
    },
    [api, fixtureLoader, actions],
  );

  const setSymbol = useCallback(
    (next: string) => {
      actions.abortFamily(FAMILY.history);
      actions.abortFamily(FAMILY.signal);
      actions.abortFamily(FAMILY.backtest);
      setPairIdSeenFor(null);
      setPairIdState(null);
      setSymbolState(next);
    },
    [actions],
  );

  const setPairId = useCallback(
    (next: string | null) => {
      actions.abortFamily(FAMILY.history);
      actions.abortFamily(FAMILY.signal);
      actions.abortFamily(FAMILY.backtest);
      setPairIdState(next);
    },
    [actions],
  );

  const source = useMemo(() => ({ mode: config.mode, config }), [config]);

  const value = useMemo<ApiContextValue>(
    () => ({
      source,
      health,
      dq,
      refreshDq,
      contracts,
      refreshContracts,
      pairs,
      refreshPairs,
      symbols,
      symbol,
      setSymbol,
      pairsForSymbol,
      pairId,
      setPairId,
      selectedPair,
      history,
      refreshHistory,
      signal,
      refreshSignal,
      backtest,
      refreshBacktest,
      runBacktest,
    }),
    [
      source, health, dq, refreshDq, contracts, refreshContracts, pairs, refreshPairs,
      symbols, symbol, setSymbol, pairsForSymbol, pairId, setPairId, selectedPair,
      history, refreshHistory, signal, refreshSignal, backtest, refreshBacktest, runBacktest,
    ],
  );

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}
