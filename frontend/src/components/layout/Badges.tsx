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

/**
 * Pair status per GET /api/pairs: candidate_only | eligible. An eligible pair
 * still requires verified specs + quant thresholds; unknown values render.
 */
export function PairStatusBadge({ status }: { status: string }) {
  if (status === "eligible") return <StatusBadge tone="pos">Eligible pair</StatusBadge>;
  if (status === "candidate_only") {
    return (
      <StatusBadge tone="mute" title="Candidate only: specs unverified and/or quant thresholds unmet.">
        Candidate only
      </StatusBadge>
    );
  }
  return <StatusBadge tone="warn">{status}</StatusBadge>;
}

/**
 * Signal decision per POST /api/signals/analyze. The quant service is not
 * wired yet, so NO_TRADE is expected; the badge is honest either way.
 */
export function DecisionBadge({ decision }: { decision: string }) {
  if (decision === "NO_TRADE") return <StatusBadge tone="mute">No trade</StatusBadge>;
  if (decision === "BUY_NEAR_SELL_FAR") return <StatusBadge tone="pos">Buy near · sell far</StatusBadge>;
  if (decision === "SELL_NEAR_BUY_FAR") return <StatusBadge tone="neg">Sell near · buy far</StatusBadge>;
  return <StatusBadge tone="warn">{decision}</StatusBadge>;
}

/** Contract/spec verification registry state: verified | unverified | conflicting. */
export function VerificationBadge({ status }: { status: string }) {
  if (status === "verified") return <StatusBadge tone="pos" title="Spec fields verified with a source.">Verified</StatusBadge>;
  if (status === "conflicting") return <StatusBadge tone="neg" title="Sources conflict for this contract.">Conflicting</StatusBadge>;
  if (status === "unverified") {
    return (
      <StatusBadge tone="warn" title="No verified specification yet — spec fields stay null by design.">
        Unverified
      </StatusBadge>
    );
  }
  return <StatusBadge tone="mute">{status}</StatusBadge>;
}

/** Reason-code strip for a single observation/contract reason token. */
export function ReasonCodeBadge({ code }: { code: string }) {
  const tone: BadgeTone =
    code === "ZERO_VOLUME" || code === "STALE_PRICE" || code === "UNVERIFIED_SPEC"
      ? "warn"
      : code === "INSUFFICIENT_HISTORY"
        ? "neg"
        : "mute";
  return <StatusBadge tone={tone}>{code.toLowerCase().replace(/_/g, " ")}</StatusBadge>;
}

/** Data-quality issue severity (header level for an issue row). */
export function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "critical" || severity === "error") return <StatusBadge tone="neg">{severity}</StatusBadge>;
  if (severity === "warning") return <StatusBadge tone="warn">{severity}</StatusBadge>;
  if (severity === "info") return <StatusBadge tone="mute">{severity}</StatusBadge>;
  return <StatusBadge tone="mute">{severity}</StatusBadge>;
}

/** History-sufficiency gate (from /api/data-quality history_sufficiency). */
export function SufficiencyBadge({ ok, what }: { ok: boolean; what: string }) {
  return ok ? (
    <StatusBadge tone="pos">{what} supported</StatusBadge>
  ) : (
    <StatusBadge tone="warn" title="Gate failed: diagnostics-only output by design.">
      {what} refused
    </StatusBadge>
  );
}
