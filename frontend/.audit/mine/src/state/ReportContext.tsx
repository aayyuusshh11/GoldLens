import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { BacktestReportDTO } from "@/lib/api/types";
import { resolveBaseUrl } from "@/lib/api/config";

export type ReportSource =
  | { mode: "none" }
  /**
   * Opt-in demo: supplied sample payload, permanently labeled
   * "Sample report — not live data". Never merged with live state.
   */
  | { mode: "sample" }
  /**
   * Activated only by a real API response from a CONFIRMED endpoint.
   * Fetched explicitly via a user action, never silently.
   */
  | { mode: "live"; report: BacktestReportDTO; baseUrl: string; fetchedAt: string };

interface ReportContextValue {
  source: ReportSource;
  loadSample: () => void;
  clearSource: () => void;
  adoptLiveReport: (report: BacktestReportDTO, baseUrl: string) => void;
  baseUrl: string;
}

const ReportContext = createContext<ReportContextValue | null>(null);

export function ReportProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<ReportSource>({ mode: "none" });

  const loadSample = useCallback(() => setSource({ mode: "sample" }), []);
  const clearSource = useCallback(() => setSource({ mode: "none" }), []);
  const adoptLiveReport = useCallback((report: BacktestReportDTO, baseUrl: string) => {
    setSource({ mode: "live", report, baseUrl, fetchedAt: new Date().toISOString() });
  }, []);

  const value = useMemo<ReportContextValue>(
    () => ({
      source,
      loadSample,
      clearSource,
      adoptLiveReport,
      baseUrl: resolveBaseUrl(import.meta.env.VITE_API_BASE_URL),
    }),
    [source, loadSample, clearSource, adoptLiveReport],
  );

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReport(): ReportContextValue {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error("useReport must be used inside <ReportProvider>");
  return ctx;
}

export const SAMPLE_LABEL = "Sample report — not live data";
