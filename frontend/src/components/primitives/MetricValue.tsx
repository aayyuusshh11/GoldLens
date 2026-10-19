import type { ReactNode } from "react";
import {
  formatInt,
  formatLakhs,
  formatLots,
  formatPrice,
  formatRatio,
  formatRupees,
  formatSignedRupees,
} from "../../lib/formatters/format";

export type MetricKind =
  | "price"
  | "rupees"
  | "signed_rupees"
  | "int"
  | "lots"
  | "ratio"
  | "lakhs"
  | "days"
  | "plain";

function formatByKind(value: number, kind: MetricKind): string {
  switch (kind) {
    case "price":
      return formatPrice(value);
    case "rupees":
      return formatRupees(value);
    case "signed_rupees":
      return formatSignedRupees(value);
    case "int":
      return formatInt(value);
    case "lots":
      return formatLots(value);
    case "ratio":
      return formatRatio(value);
    case "lakhs":
      return `${formatLakhs(value)}\u00A0lakh`;
    case "days":
      return `${formatInt(value)}\u00A0d`;
    case "plain":
      return formatLots(value);
  }
}

/**
 * Renders a metric with a unit and distinguishes "missing" from "zero":
 * null/undefined never renders as 0 — it renders the `unavailable` text in a
 * muted style. Values use monospace + tabular numerals so columns align.
 */
export function MetricValue({
  value,
  kind = "plain",
  unavailable,
  note,
  tone = "neutral",
  big = false,
}: {
  value: number | null | undefined;
  kind?: MetricKind;
  /** Explicit reason shown when value is null, e.g. "Withheld — costs not configured". */
  unavailable?: string;
  note?: string;
  /** "sign" colors positive/negative rupee values. */
  tone?: "sign" | "neutral";
  big?: boolean;
}) {
  let content: ReactNode;
  let colorClass = "text-ink";

  if (value === null || value === undefined) {
    content = unavailable ?? "—";
    colorClass = "text-mute";
  } else {
    content = formatByKind(value, kind);
    if (tone === "sign" && (kind === "rupees" || kind === "signed_rupees")) {
      if (value > 0) colorClass = "text-pos";
      else if (value < 0) colorClass = "text-neg";
    }
  }

  return (
    <span
      className={`inline-flex flex-col font-mono tabular leading-tight ${big ? "text-xl" : "text-sm font-medium"}`}
      title={
        (value === null || value === undefined)
          ? unavailable ?? "Not available in this report"
          : undefined
      }
    >
      <span className={colorClass}>{content}</span>
      {note !== undefined && <span className="mt-0.5 font-sans text-[11px] text-mute">{note}</span>}
    </span>
  );
}
