import { useMemo } from "react";
import { ReasonCodeBadge } from "../../components/layout/Badges";

/**
 * Legend of reason/verification tokens, rendered ONLY from the tokens actually
 * present in the data the caller passes (PROMPT 8.6: "render only reasons
 * actually returned"). The list is never hardcoded — unknown/unseen codes
 * simply do not appear. Tokens render verbatim; this UI never invents
 * meanings for them.
 */
export function ReasonTokenLegend({
  tokens,
  caption,
}: {
  tokens: string[];
  /** Optional extra context line (e.g. where the tokens come from). */
  caption?: string;
}) {
  const present = useMemo(() => [...new Set(tokens)].sort(), [tokens]);

  if (present.length === 0) {
    return (
      <p className="text-xs text-mute">
        No reason or verification codes appear in the current data — nothing to define.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="mb-2 text-[11px] uppercase tracking-widest text-mute">
        Codes present in the current data (verbatim from the API)
      </p>
      <ul className="flex flex-wrap gap-2">
        {present.map((token) => (
          <li key={token}>
            <ReasonCodeBadge code={token} />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-mute">
        {caption ?? "Codes are the pipeline's own strings; their meaning is owned by the backend contract, not by this UI."}
      </p>
    </div>
  );
}
