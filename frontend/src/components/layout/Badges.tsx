import type { ReactNode } from "react";

export type BadgeTone = "pos" | "neg" | "warn" | "gold" | "mute";

const TONE_CLASSES: Record<BadgeTone, string> = {
  pos: "border-pos/40 bg-pos/10 text-pos",
  neg: "border-neg/40 bg-neg/10 text-neg",
  warn: "border-warn/40 bg-warn/10 text-warn",
  gold: "border-gold/40 bg-gold/10 text-gold",
  mute: "border-line bg-elevated text-mute",
};

/** Small semantic status pill. Never used as decoration. */
export function StatusBadge({
  tone = "mute",
  title,
  children,
}: {
  tone?: BadgeTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Signal labels come from the API; unknown labels still render (warn tone). */
export function SignalBadge({ signal }: { signal: string }) {
  switch (signal) {
    case "LONG":
      return <StatusBadge tone="pos">Long</StatusBadge>;
    case "SHORT":
      return <StatusBadge tone="neg">Short</StatusBadge>;
    case "EXIT":
      return <StatusBadge tone="gold">Exit</StatusBadge>;
    case "NO TRADE":
      return <StatusBadge tone="mute">No trade</StatusBadge>;
    default:
      return <StatusBadge tone="warn">{signal}</StatusBadge>;
  }
}

export function EligibleBadge({ eligible }: { eligible: boolean }) {
  return eligible ? (
    <StatusBadge tone="pos">Eligible</StatusBadge>
  ) : (
    <StatusBadge tone="mute">Rejected</StatusBadge>
  );
}

export function ValidityBadge({ isValid }: { isValid: boolean }) {
  return isValid ? (
    <StatusBadge tone="pos">Valid backtest</StatusBadge>
  ) : (
    <StatusBadge tone="neg">Not a valid backtest</StatusBadge>
  );
}

export function MetricsStatusBadge({ status }: { status: string | null }) {
  if (status === null) return <StatusBadge tone="mute">No metrics block</StatusBadge>;
  if (status === "diagnostics_only") return <StatusBadge tone="warn">Diagnostics only</StatusBadge>;
  if (status === "backtest") return <StatusBadge tone="pos">Backtest</StatusBadge>;
  return <StatusBadge tone="mute">{status}</StatusBadge>;
}

export function StaleBadge() {
  return (
    <StatusBadge tone="warn" title="Pipeline flagged this leg as stale on this date.">
      Stale
    </StatusBadge>
  );
}
