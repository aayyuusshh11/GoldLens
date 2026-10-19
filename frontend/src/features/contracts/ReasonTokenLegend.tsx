import { useMemo } from "react";
import type { EligibleContractDTO } from "../../types/api";

/**
 * Glossary rendered ONLY from reason tokens actually present in the loaded
 * report (PROMPT 8.6: "Render only reasons actually returned"). Glosses are
 * flagged as observed wording pending quant-owner confirmation; unknown
 * tokens render verbatim without a gloss instead of being interpreted.
 */
const OBSERVED_GLOSSES: Record<string, string> = {
  symbol_not_verified: "no verified contract specification for this symbol (B11-related)",
  "dte<21": "days to expiry below the near-leg session window observed in data",
  "vol<500": "session volume below the 500-lot floor observed in data",
  "oi<1000": "open interest below the 1000-lot floor observed in data",
  "value<100.0": "traded value below ₹100 lakh floor observed in data",
};

export function ReasonTokenLegend({ contracts }: { contracts: EligibleContractDTO[] }) {
  const tokens = useMemo(() => {
    const present = new Set<string>();
    for (const contract of contracts) {
      for (const token of (contract.reason ?? "").split("|")) {
        if (token !== "") present.add(token);
      }
    }
    return [...present].sort();
  }, [contracts]);

  if (tokens.length === 0) {
    return (
      <p className="text-xs text-mute">
        No rejection reason tokens in this dataset — every listed contract is either
        eligible or carries a different rejection form.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="mb-2 text-[11px] uppercase tracking-widest text-mute">
        Reason tokens present in this snapshot (verbatim from the pipeline)
      </p>
      <ul className="grid gap-2 text-xs sm:grid-cols-2">
        {tokens.map((token) => (
          <li key={token} className="flex items-baseline gap-2">
            <span className="rounded border border-line bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-mute">
              {token}
            </span>
            <span className="text-mute">
              {OBSERVED_GLOSSES[token] ?? "meaning pending quant-owner confirmation (B-listed)"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-mute">
        Glosses are observed in the supplied sample (docs/DATA_SCHEMA.md §3); the exact
        thresholds and wording still need the quant owner&apos;s confirmation.
      </p>
    </div>
  );
}
