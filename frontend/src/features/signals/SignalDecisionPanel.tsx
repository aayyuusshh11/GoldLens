import type { ReactNode } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import type { PairSummaryDTO, SignalAnalyzeDTO } from "../../types/api";
import { formatDateShort, formatRatio, formatSignedRupees } from "../../lib/formatters/format";
import { DecisionBadge, ReasonCodeBadge } from "../../components/layout/Badges";
import { DataNotice } from "../../components/primitives/DataNotice";
import { SectionPanel } from "../../components/primitives/SectionPanel";

/**
 * Presentational decision block for POST /api/signals/analyze — no page
 * chrome, no data fetching. Null quant fields (z_score / gross_edge /
 * estimated_cost / net_edge) render "—" with the honest explanation; they are
 * never coerced to zero and never reworded.
 */

function Metric({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-widest text-mute">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm font-medium tabular text-ink">{children}</dd>
    </div>
  );
}

function NullMetric({ label }: { label: string }) {
  return (
    <Metric label={label}>
      <span className="text-mute">—</span>
    </Metric>
  );
}

export function SignalDecisionPanel({
  signal,
  pair,
}: {
  signal: SignalAnalyzeDTO;
  pair: PairSummaryDTO | null;
}) {
  const nullQuantFields = [
    ["z_score", signal.z_score] as const,
    ["gross_edge", signal.gross_edge] as const,
    ["estimated_cost", signal.estimated_cost] as const,
    ["net_edge", signal.net_edge] as const,
  ].filter(([, value]) => value === null);
  const hasNullQuant = nullQuantFields.length > 0;

  return (
    <SectionPanel
      kicker="Latest decision"
      title={`As of ${formatDateShort(signal.as_of_date)}`}
      actions={<DecisionBadge decision={signal.decision} />}
      caption={
        pair === null
          ? `pair_id: ${signal.pair_id}`
          : `${pair.pair_id} · near ${pair.near.expiry_date} → far ${pair.far.expiry_date}`
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {signal.reason_codes.map((code) => (
          <ReasonCodeBadge key={code} code={code} />
        ))}
        {signal.reason_codes.length === 0 && (
          <p className="text-sm text-mute">No reason codes returned.</p>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
        <Metric label="Spread (near − far)">
          {signal.spread === null ? (
            <span className="text-mute">—</span>
          ) : (
            formatSignedRupees(signal.spread)
          )}
        </Metric>
        {signal.z_score === null ? (
          <NullMetric label="z-score" />
        ) : (
          <Metric label="z-score">{formatRatio(signal.z_score)}</Metric>
        )}
        <Metric label="Gross edge (₹)">
          {signal.gross_edge === null ? (
            <span className="text-mute">—</span>
          ) : (
            formatSignedRupees(signal.gross_edge)
          )}
        </Metric>
        <Metric label="Estimated cost (₹)">
          {signal.estimated_cost === null ? (
            <span className="text-mute">—</span>
          ) : (
            formatSignedRupees(signal.estimated_cost)
          )}
        </Metric>
        <Metric label="Net edge (₹)">
          {signal.net_edge === null ? (
            <span className="text-mute">—</span>
          ) : (
            formatSignedRupees(signal.net_edge)
          )}
        </Metric>
      </dl>

      {hasNullQuant && (
        <div className="mt-3">
          <DataNotice tone="info" title="Quant fields not computed on this date">
            <span className="flex items-start gap-2">
              <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-mute" aria-hidden />
              <span>
                <span className="font-mono">{nullQuantFields.map(([name]) => name).join(", ")}</span>:
                not computed — quant service not wired / &lt;30 distinct dates; the backend refuses to
                fabricate. Absent means absent — never shown as zero.
              </span>
            </span>
          </DataNotice>
        </div>
      )}
      {!hasNullQuant && (
        <div className="mt-3">
          <DataNotice tone="pos" title="All quant fields present for this date">
            <span className="flex items-start gap-2">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-pos" aria-hidden />
              <span>
                Every quant field carries a computed value for this date. The decision still
                depends on thresholds — read it as research output, not trade advice.
              </span>
            </span>
          </DataNotice>
        </div>
      )}

      <div className="mt-3">
        <DataNotice tone="info" title="Backend notes (verbatim)">
          {signal.notes === null ? (
            <span className="text-mute">No notes returned for this decision.</span>
          ) : (
            <p className="whitespace-pre-line">{signal.notes}</p>
          )}
        </DataNotice>
      </div>
    </SectionPanel>
  );
}
