import type { BacktestReportDTO } from "../../types/api";
import { costsNotConfigured } from "../../lib/reportAnalysis";
import { formatRatio } from "../../lib/formatters/format";

/**
 * Shared run-configuration chips (PROMPT 7.1 / SKILLS.md): every threshold and
 * gate value renders verbatim from report.config with its unit baked into the
 * label. Costs missing is a warn chip, never silently omitted.
 *
 * Consumed by Backtest (full run configuration) and Signal Forensics (context
 * above the decision log) so both screens tell the same config story.
 */
export function ConfigChips({ report, idPrefix }: { report: BacktestReportDTO; idPrefix?: string }) {
  const config = report.config;
  const costsMissing = costsNotConfigured(report);
  const chips: Array<{ label: string; value: string; tone?: "warn" }> = [
    { label: "lookback", value: `${config.lookback_days}d` },
    { label: "entry ±z", value: formatRatio(config.z_entry) },
    { label: "exit z", value: formatRatio(config.z_exit) },
    { label: "stop ±z", value: formatRatio(config.stop_z) },
    { label: "min history", value: `${config.min_hist_days}d` },
    { label: "max holding", value: `${config.max_holding_days}d` },
    { label: "exec", value: config.exec_mode },
    { label: "overlap", value: config.allow_overlap ? "allowed" : "not allowed" },
    { label: "lots/leg", value: String(config.lots_per_leg) },
    { label: "folds", value: String(config.walk_forward_folds) },
    {
      label: "costs",
      value: costsMissing ? "not configured" : (config.costs ?? "—"),
      tone: costsMissing ? "warn" : undefined,
    },
  ];
  const keyPrefix = idPrefix ?? "config";
  return (
    <ul className="flex flex-wrap gap-2">
      {chips.map((chip, index) => (
        <li key={`${keyPrefix}-${chip.label}-${index}`}>
          <span
            className={`inline-flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-xs ${
              chip.tone === "warn" ? "border-warn/40 text-warn" : "border-line bg-elevated text-mute"
            }`}
          >
            <span className="text-[10px] uppercase tracking-wider opacity-80">{chip.label}</span>
            <span className="font-mono tabular text-ink">{chip.value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
