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
import type { BacktestReportDTO, ReportSymbol } from "../types/api";
import { REPORT_SYMBOLS } from "../types/api";
import type { AppError } from "../lib/api/errors";
import { describeError } from "../lib/api/errors";
import { appConfig, type AppConfig, type DataMode } from "../lib/api/config";
import { loadFixtureReport } from "../lib/api/fixtures";
import { createGoldLensApi, type GoldLensApi } from "../lib/api/report";

/**
 * Report data layer.
 *
 * - One shared report per symbol, cached so navigating between pages or
 *   reselecting a symbol never silently refetches.
 * - In-flight requests abort on symbol change/unmount; a generation counter
 *   guards every state write so stale responses cannot land.
 * - Failures are explicit state. There is NO fallback to fixture data in
 *   live mode — errors render, and user-initiated refreshes keep the last
 *   good report visible while a refresh is in flight (clearly labeled).
 * - Health is lightly probed (live mode only) for the header pill; it never
 *   gates rendering.
 */

export interface ReportCacheEntry {
  report: BacktestReportDTO;
  fetchedAt: Date;
}

export type ReportEntry =
  | { key: "idle"; symbol: ReportSymbol }
  | { key: "loading"; symbol: ReportSymbol }
  | {
      key: "ready";
      symbol: ReportSymbol;
      report: BacktestReportDTO;
      fetchedAt: Date;
      refreshing: boolean;
    }
  | { key: "error"; symbol: ReportSymbol; error: AppError; report: BacktestReportDTO | null };

export type HealthState = { key: "checking" | "ok" | "down" | "fixture"; detail?: string };

export interface ReportContextValue {
  symbol: ReportSymbol;
  setSymbol: (next: ReportSymbol) => void;
  refresh: () => void;
  entry: ReportEntry;
  health: HealthState;
  source: { mode: DataMode; config: AppConfig };
}

export const ReportContext = createContext<ReportContextValue | null>(null);

export function useReport(): ReportContextValue {
  const value = useContext(ReportContext);
  if (!value) throw new Error("useReport must be used inside <ReportProvider>");
  return value;
}

/** Last good report (cached or stale) or null while loading/first error. */
export function useCurrentReport(): BacktestReportDTO | null {
  const { entry } = useReport();
  if (entry.key === "ready") return entry.report;
  if (entry.key === "error") return entry.report;
  return null;
}

function normalizeSymbol(value: string): ReportSymbol {
  const match = REPORT_SYMBOLS.find((candidate) => candidate === value);
  return match ?? "GOLDM";
}

export function ReportProvider({ children }: { children: ReactNode }) {
  const config = appConfig();
  const [symbol, setSymbolState] = useState<ReportSymbol>(config.defaultSymbol);
  const [entry, setEntry] = useState<ReportEntry>({ key: "idle", symbol: config.defaultSymbol });
  const [health, setHealth] = useState<HealthState>(
    config.mode === "fixture" ? { key: "fixture" } : { key: "checking" },
  );

  const cacheRef = useRef(new Map<ReportSymbol, ReportCacheEntry>());
  const generationRef = useRef(0);
  const entryRef = useRef<ReportEntry>(entry);
  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);

  const api = useMemo<GoldLensApi | null>(
    () => (config.mode === "live" && config.baseUrl ? createGoldLensApi(config.baseUrl) : null),
    [config.mode, config.baseUrl],
  );

  /* Health probe: live mode only, never gates rendering. */
  useEffect(() => {
    if (config.mode !== "live" || api === null) return;
    let cancelled = false;
    api
      .health()
      .then((h) => {
        if (cancelled) return;
        setHealth(
          h.status === "ok"
            ? { key: "ok", detail: h.service }
            : { key: "down", detail: `health status: ${h.status}` },
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setHealth({ key: "down", detail: describeError(error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [config.mode, api]);

  /* Mount + symbol change: serve cache instantly, else load once. */
  useEffect(() => {
    const cachedEntry = cacheRef.current.get(symbol);
    if (cachedEntry !== undefined) {
      setEntry({ key: "ready", symbol, report: cachedEntry.report, fetchedAt: cachedEntry.fetchedAt, refreshing: false });
      return;
    }

    const gen = ++generationRef.current;
    const controller = new AbortController();
    setEntry({ key: "loading", symbol });

    const run = async (): Promise<void> => {
      try {
        let report: BacktestReportDTO;
        if (config.mode === "fixture") {
          report = await loadFixtureReport(symbol, config.fixtureDelayMs, controller.signal);
        } else if (api !== null) {
          report = await api.report(symbol, controller.signal);
        } else {
          throw new Error("Live mode without an API client — check VITE_API_BASE_URL.");
        }
        if (gen !== generationRef.current) return; // stale response
        const cacheItem = { report, fetchedAt: new Date() };
        cacheRef.current.set(symbol, cacheItem);
        setEntry({ key: "ready", symbol, report, fetchedAt: cacheItem.fetchedAt, refreshing: false });
      } catch (error) {
        if (gen !== generationRef.current) return;
        const appError = describeError(error);
        if (appError.code === "cancelled") return;
        const stale = cacheRef.current.get(symbol)?.report ?? null;
        setEntry({ key: "error", symbol, error: appError, report: stale });
      }
    };
    void run();

    return () => {
      generationRef.current = gen + 1; // invalidate this load
      controller.abort();
    };
  }, [symbol, config.mode, config.fixtureDelayMs, api]);

  /* User-initiated refresh: bypass cache, keep last good data visible. */
  const refresh = useCallback(() => {
    const gen = ++generationRef.current;
    const controller = new AbortController();
    const current = entryRef.current;
    const stale = current.key === "ready" ? current.report : current.key === "error" ? current.report : null;

    if (current.key === "ready") {
      setEntry({ ...current, refreshing: true });
    } else if (current.key === "error") {
      setEntry({ key: "loading", symbol });
    }

    const run = async (): Promise<void> => {
      try {
        let report: BacktestReportDTO;
        if (config.mode === "fixture") {
          report = await loadFixtureReport(symbol, config.fixtureDelayMs, controller.signal);
        } else if (api !== null) {
          report = await api.report(symbol, controller.signal);
        } else {
          throw new Error("Live mode without an API client — check VITE_API_BASE_URL.");
        }
        if (gen !== generationRef.current) return;
        const cacheItem = { report, fetchedAt: new Date() };
        cacheRef.current.set(symbol, cacheItem);
        setEntry({ key: "ready", symbol, report, fetchedAt: cacheItem.fetchedAt, refreshing: false });
      } catch (error) {
        if (gen !== generationRef.current) return;
        const appError = describeError(error);
        if (appError.code === "cancelled" && stale !== null) {
          // Aborted supersession: restore the previous good state verbatim.
          const cachedEntry = cacheRef.current.get(symbol);
          if (cachedEntry !== undefined) {
            setEntry({ key: "ready", symbol, report: cachedEntry.report, fetchedAt: cachedEntry.fetchedAt, refreshing: false });
          }
          return;
        }
        if (appError.code === "cancelled") return;
        setEntry({ key: "error", symbol, error: appError, report: stale });
      }
    };
    void run();
  }, [symbol, config.mode, config.fixtureDelayMs, api]);

  const setSymbol = useCallback((next: ReportSymbol) => {
    setSymbolState(normalizeSymbol(next));
  }, []);

  const source = useMemo(() => ({ mode: config.mode, config }), [config]);

  const value = useMemo<ReportContextValue>(
    () => ({ symbol, setSymbol, refresh, entry, health, source }),
    [symbol, setSymbol, refresh, entry, health, source],
  );

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}
