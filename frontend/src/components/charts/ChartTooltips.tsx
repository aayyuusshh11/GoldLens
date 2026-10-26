import type { TooltipProps } from "recharts";
import { formatDateShort, formatPrice } from "../../lib/formatters/format";
import { SERIES_COLOR } from "../../lib/charts/chartColors";
import type { SpreadObservationDTO } from "../../types/api";

/**
 * Custom tooltips for the settled pair-history payload (SpreadObservationDTO).
 * Rows with a null value render "—" — never 0 — and the observation status plus
 * its reason codes are always surfaced (SKILLS.md data rules). There is no
 * z-score payload in the settled API, so the old z tooltip is gone.
 */

const TOOLTIP_SHELL =
  "rounded-lg border border-line bg-elevated px-3 py-2 text-xs shadow-lg shadow-black/30";

function Row({ label, color, value }: { label: string; color?: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-5 whitespace-nowrap">
      <dt className="flex items-center gap-1.5 text-mute">
        {color !== undefined && (
          <span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
        )}
        {label}
      </dt>
      <dd className="font-mono tabular text-ink">{value ?? "—"}</dd>
    </div>
  );
}

function titleFromLabel(label: TooltipProps<number, string>["label"]): string {
  if (typeof label === "string") return formatDateShort(label);
  if (typeof label === "number") return String(label);
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Rows shaped like PairHistoryDTO observations: status + reason_codes, no `stale` flag. */
function isSpreadObservation(value: unknown): value is SpreadObservationDTO {
  return (
    isRecord(value) &&
    typeof value.trade_date === "string" &&
    typeof value.status === "string" &&
    Array.isArray(value.reason_codes)
  );
}

function observationFromPayload(props: TooltipProps<number, string>): SpreadObservationDTO | null {
  const row = props.payload?.[0]?.payload;
  return isSpreadObservation(row) ? row : null;
}

/** Verbatim status + reason codes for the hovered session. */
function StatusLine({ observation }: { observation: SpreadObservationDTO }) {
  return (
    <p className="mt-1 border-t border-line pt-1">
      <span className="text-mute">status: </span>
      <span className="font-mono text-ink">{observation.status}</span>
      {observation.reason_codes.length > 0 && (
        <>
          <span className="text-mute"> · reasons: </span>
          <span className="font-mono text-warn">{observation.reason_codes.join(", ")}</span>
        </>
      )}
    </p>
  );
}

export function NearFarTooltip(props: TooltipProps<number, string>) {
  if (!props.active) return null;
  const observation = observationFromPayload(props);
  return (
    <div className={TOOLTIP_SHELL}>
      <p className="mb-1 font-semibold text-ink">{titleFromLabel(props.label)}</p>
      {observation === null ? (
        <p className="text-mute">Session details not available.</p>
      ) : (
        <>
          <dl className="space-y-1">
            <Row
              label="near close (₹)"
              color={SERIES_COLOR.near}
              value={observation.near_close === null ? null : formatPrice(observation.near_close)}
            />
            <Row
              label="far close (₹)"
              color={SERIES_COLOR.far}
              value={observation.far_close === null ? null : formatPrice(observation.far_close)}
            />
            <Row
              label="spread (₹)"
              value={observation.spread === null ? null : formatPrice(observation.spread)}
            />
          </dl>
          <StatusLine observation={observation} />
        </>
      )}
    </div>
  );
}

export function SpreadTooltip(props: TooltipProps<number, string>) {
  if (!props.active) return null;
  const observation = observationFromPayload(props);
  return (
    <div className={TOOLTIP_SHELL}>
      <p className="mb-1 font-semibold text-ink">{titleFromLabel(props.label)}</p>
      {observation === null ? (
        <p className="text-mute">Session details not available.</p>
      ) : (
        <>
          <dl className="space-y-1">
            <Row
              label="spread (₹)"
              value={observation.spread === null ? null : formatPrice(observation.spread)}
            />
            <Row
              label="near close (₹)"
              color={SERIES_COLOR.near}
              value={observation.near_close === null ? null : formatPrice(observation.near_close)}
            />
            <Row
              label="far close (₹)"
              color={SERIES_COLOR.far}
              value={observation.far_close === null ? null : formatPrice(observation.far_close)}
            />
          </dl>
          <StatusLine observation={observation} />
        </>
      )}
    </div>
  );
}
