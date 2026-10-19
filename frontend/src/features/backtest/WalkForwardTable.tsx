import type { WalkForwardFold } from "../../types/api";
import { EmptyState } from "../../components/states/EmptyState";
import { DataNotice } from "../../components/primitives/DataNotice";

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Walk-forward comparisons. The contract draft does not document inner keys
 * yet, so the table is generic and columns carry the field names returned by
 * the pipeline verbatim until the quant owner confirms the schema
 * (docs/INTEGRATION_BLOCKERS.md). No invented column meanings.
 */
export function WalkForwardTable({
  entries,
  foldsExpected,
}: {
  entries: WalkForwardFold[];
  foldsExpected: number;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="No walk-forward fold comparisons returned"
        body={`The pipeline produced no folds (reported walk_forward_folds = ${foldsExpected}). This indicates the history was too short to run folds, not a data error.`}
      />
    );
  }

  const columns = Object.keys(entries[0] ?? { "(no fields)": "" });

  return (
    <div>
      <DataNotice tone="info" title="Column meanings pending confirmation">
        Inner keys of <span className="font-mono text-xs">walk_forward_cmp</span> are not documented
        in the API contract draft yet (quant-owner item). Columns below carry the field names
        returned by the pipeline verbatim — no meanings are inferred in the UI.
      </DataNotice>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <caption className="sr-only">Walk-forward fold comparison (field names from pipeline)</caption>
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-widest text-mute">
              {columns.map((key) => (
                <th scope="col" key={key} className="py-2 pr-4 font-semibold">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, rowIndex) => (
              <tr key={rowIndex} className="border-b border-line/50 last:border-b-0 hover:bg-elevated/40">
                {columns.map((key) => (
                  <td key={key} className="py-2 pr-4 font-mono tabular text-ink">
                    {renderCell(entry[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-mute">
        Each row is one fold comparison. Rendering is verbatim from the API — column
        meanings will be labeled after quant confirmation.
      </p>
    </div>
  );
}
