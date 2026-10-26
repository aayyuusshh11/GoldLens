import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateTick } from "../../lib/formatters/format";
import { SERIES_COLOR } from "../../lib/charts/chartColors";
import type { SpreadObservationDTO } from "../../types/api";
import { ChartPanel } from "./ChartPanel";
import { NearFarTooltip } from "./ChartTooltips";

const AXIS_TICK = { fill: SERIES_COLOR.axis, fontSize: 11 };
const GRID_LINE = { stroke: SERIES_COLOR.grid, strokeDasharray: "2 4" };

// Respects prefers-reduced-motion and keeps demos/screenshots stable.
const isAnimationActive = false;

/**
 * The shared palette maps both `spread` and `near` to the same gold. With
 * three series in one panel the spread gets the palette's threshold-danger
 * tone, and reference-only rows get a desaturated gray. Colors are declared
 * here (charts are in scope for this file) — the shared lib stays untouched.
 */
const SPREAD_COLOR = "#E16D72";
const REFERENCE_COLOR = "#6B7280";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** reference_only rows are reference data, never tradable history (hinted by ZERO_VOLUME/STALE_PRICE). */
function isReferenceRow(value: unknown): value is SpreadObservationDTO {
  return isRecord(value) && value.status === "reference_only";
}

/** Boolean check for already-typed rows (a type-predicate's false branch would narrow to never). */
function hasReferenceStatus(row: SpreadObservationDTO): boolean {
  return row.status === "reference_only";
}

/**
 * Chart row: the DTO verbatim plus two presentation-only splits so the solid
 * line covers tradable observations and the dashed line covers reference_only
 * rows. Derived sidekick fields — the DTO's own names are never renamed.
 */
interface SpreadChartRow extends SpreadObservationDTO {
  spread_tradable: number | null;
  spread_reference: number | null;
}

/** Hollow dot = reference_only session; filled dot otherwise. Nulls never become 0. */
function statusDot(color: string) {
  return function StatusDot(props: { cx?: number; cy?: number; payload?: unknown }) {
    const { cx, cy, payload } = props;
    if (typeof cx !== "number" || typeof cy !== "number") return <g />;
    const reference = isReferenceRow(payload);
    return (
      <circle
        cx={cx}
        cy={cy}
        r={reference ? 3 : 2.5}
        fill={reference ? "none" : color}
        stroke={reference ? color : "none"}
        strokeWidth={1.4}
      />
    );
  };
}

/** Dots for the dashed reference-only spread series: always hollow and muted. */
function ReferenceDot(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props;
  if (typeof cx !== "number" || typeof cy !== "number") return <g />;
  return <circle cx={cx} cy={cy} r={3} fill="none" stroke={REFERENCE_COLOR} strokeWidth={1.4} />;
}

/**
 * Spread history for a pair, from GET /api/pairs/{pair_id}/history.
 *
 * Honesty rules (SKILLS.md):
 *  - null near/far/spread Leave a GAP (connectNulls=false) — never zero-filled
 *    or interpolated across missing sessions.
 *  - reference_only rows (zero-volume / stale quotes) are drawn dashed with
 *    hollow dots and clearly labeled — they are never claimed as history.
 *  - there is no z-score series in the settled API, so none is drawn.
 */
export function SpreadChart({ observations }: { observations: SpreadObservationDTO[] }) {
  const rows: SpreadChartRow[] = [...observations]
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    .map((o) => ({
      ...o,
      spread_tradable: hasReferenceStatus(o) ? null : o.spread,
      spread_reference: hasReferenceStatus(o) ? o.spread : null,
    }));

  const hasSpread = observations.some((o) => o.spread !== null);

  return (
    <ChartPanel
      title="Spread history"
      question="Do the near and far legs converge or diverge, session by session?"
      subtitle={`Closes and spread (near − far) as returned by the history route · ${observations.length} session(s) plotted`}
      legend={[
        { color: SERIES_COLOR.near, label: "near expiry close (₹)" },
        { color: SERIES_COLOR.far, label: "far expiry close (₹)" },
        { color: SPREAD_COLOR, label: "spread (₹) — tradable observations" },
        { color: REFERENCE_COLOR, variant: "dashed", label: "spread · reference_only — not tradable history" },
      ]}
      footer={
        <span>
          Hollow/dashed marks = reference_only rows (hinted by ZERO_VOLUME / STALE_PRICE
          reason codes) — reference data, never counted as tradable history. Gaps mean the
          close was missing (null) — values are not zero-filled or interpolated.
        </span>
      }
    >
      {observations.length === 0 ? (
        <p className="px-3 py-2 text-sm text-mute">
          No observations in this response — nothing to plot.
        </p>
      ) : (
        <>
          <p className="sr-only">
            Line chart of {rows.length} session(s): near expiry close, far expiry close and
            spread (near − far) in ₹ per trade date. Sessions marked reference_only (for
            example zero volume or stale price) are drawn dashed and muted — they are
            reference data, not tradable history. Missing closes leave gaps and are never
            zero-filled.
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={rows} margin={{ top: 8, right: 24, bottom: 4, left: 8 }}>
              <CartesianGrid stroke={GRID_LINE.stroke} strokeDasharray={GRID_LINE.strokeDasharray} />
              <XAxis
                dataKey="trade_date"
                tick={AXIS_TICK}
                stroke={SERIES_COLOR.grid}
                tickFormatter={(value: string) => formatDateTick(value)}
                interval="preserveStartEnd"
                minTickGap={32}
              />
              <YAxis
                tick={AXIS_TICK}
                stroke={SERIES_COLOR.grid}
                width={56}
              />
              <Tooltip content={<NearFarTooltip />} cursor={{ stroke: SERIES_COLOR.grid, strokeDasharray: "3 3" }} />
              {hasSpread && (
                <ReferenceLine
                  y={0}
                  stroke={SERIES_COLOR.zero}
                  strokeDasharray="4 4"
                  label={{ value: "0", position: "left", fill: SERIES_COLOR.axis, fontSize: 10 }}
                />
              )}
              <Line
                type="linear"
                dataKey="near_close"
                name="near close (₹)"
                stroke={SERIES_COLOR.near}
                strokeWidth={2}
                dot={statusDot(SERIES_COLOR.near)}
                activeDot={{ r: 5 }}
                isAnimationActive={isAnimationActive}
                connectNulls={false}
              />
              <Line
                type="linear"
                dataKey="far_close"
                name="far close (₹)"
                stroke={SERIES_COLOR.far}
                strokeWidth={2}
                dot={statusDot(SERIES_COLOR.far)}
                activeDot={{ r: 5 }}
                isAnimationActive={isAnimationActive}
                connectNulls={false}
              />
              <Line
                type="linear"
                dataKey="spread_tradable"
                name="spread (₹) — tradable"
                stroke={SPREAD_COLOR}
                strokeWidth={2}
                dot={statusDot(SPREAD_COLOR)}
                activeDot={{ r: 5 }}
                isAnimationActive={isAnimationActive}
                connectNulls={false}
              />
              <Line
                type="linear"
                dataKey="spread_reference"
                name="spread (₹) — reference_only"
                stroke={REFERENCE_COLOR}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={ReferenceDot}
                isAnimationActive={isAnimationActive}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </ChartPanel>
  );
}
