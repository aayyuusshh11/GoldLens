import type { BacktestReportDTO } from "@/lib/api/types";
import { isDiagnosticsOnly } from "@/lib/report/analysis";
import { formatInt, formatNumber } from "@/lib/format";

/**
 * Phase 4 presentation helpers. Every value is rendered from returned fields
 * with explicit units; null values are labeled — never zero.
 * (Checked null-handling cases: z, mean, std, net P&L, Sharpe, costs.)
 */
export function noTradeLabel(report: BacktestReportDTO): string {
  const latest = report.signals.at(-1);
  return latest ? `${latest.signal}` : "No signal reported";
}

export function zStateRow(report: BacktestReportDTO): string {
  const z = report.z_score.at(-1)?.z;
  return z === null || z === undefined || Number.isNaN(z) ? "Not computed (insufficient history)" : formatNumber(z);
}

export function observationsSummary(report: BacktestReportDTO): string {
  const obs = report.spread_observations;
  if (obs.length === 0) return "No spread observations returned";
  return `${formatInt(obs.length)} observation${obs.length === 1 ? "" : "s"}${isDiagnosticsOnly(report) ? " (diagnostics window)" : ""}`;
}

/** Gross is allowed to be a real zero only when the backend returned 0.0 with n_trades=0; note stays visible. */
export function grossRow(report: BacktestReportDTO): string {
  const m = report.metrics;
  if (!m || m.gross_pnl_rupees === null) return "Not available";
  return m.gross_pnl_rupees === 0 && m.n_trades === 0
    ? "₹0.00 (no trades — exact zero)"
    : `₹${formatNumber(m.gross_pnl_rupees)}`;
}

export function netRow(report: BacktestReportDTO): string {
  const m = report.metrics;
  if (!m || m.net_pnl_rupees === null) {
    return m?.net_sharpe_ratio === null
      ? "Not available — costs not configured"
      : "Not available";
  }
  return `₹${formatNumber(m.net_pnl_rupees)}`;
}

export function sharpeRow(report: BacktestReportDTO): string {
  const m = report.metrics;
  if (!m || m.sharpe_ratio === null) return "Not available";
  return formatNumber(m.sharpe_ratio);
}

export function tradesRow(report: BacktestReportDTO): string {
  const m = report.metrics;
  const count = m ? m.n_trades : report.trades.length;
  if (count === 0) return "0 trades executed (nothing traded)";
  return `${formatInt(count)} trade${count === 1 ? "" : "s"}`;
}
