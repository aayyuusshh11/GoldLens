import type { ReportSymbol } from "../../types/api";
import { ApiRequestError } from "./errors";
import { parseBacktestReport, type BacktestReportDTO } from "./parse";
import fixtureJson from "./fixtures/api_contract_sample.json";

/**
 * Development fixture: the SUPPLIED one-day diagnostic sample
 * (reference/samples/api_contract_sample.json), parsed through the same
 * runtime validator as live responses so backend drift cannot hide.
 *
 * This data is diagnostics, not live market output:
 *  - 1 trading day (2026-10-16), 1 spread observation, 0 trades
 *  - metrics.status = "diagnostics_only", net P&L withheld (costs unconfigured)
 *  - is_valid_backtest = false
 * Never present it as live or verified performance. Disable via
 * VITE_DATA_MODE=live once the API exists.
 */

const FIXTURE_SYMBOL: ReportSymbol = "GOLDM";
const FIXTURE_TRADE_DATE = "2026-10-16";

/** Pass-through so types stay checked even if the JSON import types loosen. */
const SAMPLE_REPORT = fixtureJson as unknown;

export interface FixtureResult {
  report: BacktestReportDTO;
  fetchedAt: Date;
}

export const FIXTURE_META = {
  tradeDate: FIXTURE_TRADE_DATE,
  sourceFile: "reference/samples/api_contract_sample.json",
  description:
    "One trading day, zero trades, costs not configured — diagnostics only, not performance.",
} as const;

/** Mirrors reference/quant/api.py: reject families with no tradable pair. */
export function fixtureRejectsSymbol(symbol: ReportSymbol): boolean {
  return symbol !== FIXTURE_SYMBOL;
}

function cancelledError(): ApiRequestError {
  return new ApiRequestError({
    kind: "unknown",
    code: "cancelled",
    message: "Request cancelled",
    status: null,
    details: null,
  });
}

/**
 * Loads the bundled sample through the strict runtime validator after an
 * optional simulated delay. Respects the caller's abort signal. Rejecting
 * families mirror the backend's data_quality_rejected error contract.
 */
export function loadFixtureReport(
  symbol: ReportSymbol,
  delayMs: number,
  signal?: AbortSignal,
): Promise<BacktestReportDTO> {
  return new Promise<BacktestReportDTO>((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelledError());
      return;
    }
    if (fixtureRejectsSymbol(symbol)) {
      reject(
        new ApiRequestError({
          kind: "http",
          code: "data_quality_rejected",
          message: `no tradable calendar pair for '${symbol}' on ${FIXTURE_TRADE_DATE}`,
          status: 409,
          details: { requirement: "two eligible expiries, near leg traded" },
        }),
      );
      return;
    }

    const timer = setTimeout(() => {
      try {
        resolve(parseBacktestReport(SAMPLE_REPORT));
      } catch (error) {
        reject(
          error instanceof ApiRequestError
            ? error
            : new ApiRequestError({
                kind: "schema",
                code: null,
                message: error instanceof Error ? error.message : String(error),
                status: null,
                details: null,
              }),
        );
      }
    }, Math.max(0, delayMs));

    const onAbort = () => {
      clearTimeout(timer);
      reject(cancelledError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
