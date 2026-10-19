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
import { formatDateTick, formatCompactNumber } from "../../lib/formatters/format";
import { SERIES_COLOR } from "../../lib/charts/chartColors";
import type { SpreadObservationDTO } from "../../types/api";
import { ChartPanel, formatAxisNumber } from "./ChartPanel";
import { NearFarTooltip, SpreadTooltip } from "./ChartTooltips";

const AXIS_TICK = { fill: SERIES_COLOR.axis, fontSize: 11 };
const GRID_LINE = { stroke: SERIES_COLOR.grid, strokeDasharray: "2 4" };

// Respects prefers-reduced-motion and keeps demos/screenshots stable.
const isAnimationActive = false;

/** Near vs far settlement closes — "are the two legs converging/diverging?" */
export function NearFarChart({ observations }: { observations: SpreadObservationDTO[] }) {
  return (
    <ChartPanel
      title="Near vs far close"
      question="Are the two legs converging or diverging?"
      subtitle={`Front and deferred expiry closes, ₹ · ${observations.length} session(s) plotted`}
      legend={[
        { color: SERIES_COLOR.near, label: "near expiry close (₹)" },
        { color: SERIES_COLOR.far, label: "far expiry close (₹)" },
      ]}
      footer={
        <span>
          Only observed trading dates are plotted; steps between points merely span
          non-sessions (weekends/holidays) — values are not interpolated.
        </span>
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={observations} margin={{ top: 8, right: 120, bottom: 4, left: 8 }}>
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
            tickFormatter={(value: number) => formatAxisNumber(value)}
            width={56}
          />
          <Tooltip content={<NearFarTooltip />} cursor={{ stroke: SERIES_COLOR.grid, strokeDasharray: "3 3" }} />
          <Line
            type="linear"
            dataKey="near_close"
            name="near close (₹)"
            stroke={SERIES_COLOR.near}
            strokeWidth={2}
            dot={{ r: 2.5, fill: SERIES_COLOR.near, strokeWidth: 0 }}
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
            dot={{ r: 2.5, fill: SERIES_COLOR.far, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={isAnimationActive}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}

/**
 * Spread series as produced by the quant pipeline (₹). Single observations
 * render as one point — never stretched into a fake trend.
 */
export function SpreadSeriesChart({ observations }: { observations: SpreadObservationDTO[] }) {
  const staleCount = observations.filter((o) => o.stale).length;
  return (
    <ChartPanel
      title="Spread series"
      question="What is the level of the calendar spread over time?"
      subtitle="Spread as produced by the quant pipeline, ₹ · sample sign convention is far − near (confirmation pending — see docs/INTEGRATION_BLOCKERS.md)"
      legend={[{ color: SERIES_COLOR.spread, label: "spread (₹)" }]}
      footer={
        <span>
          {staleCount > 0
            ? `${staleCount} observation(s) flagged stale by the pipeline — shown with a warning tag in the tooltip.`
            : "Zero line marks spread = 0; no interpolation across missing sessions."}
        </span>
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={observations} margin={{ top: 8, right: 24, bottom: 4, left: 8 }}>
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
            tickFormatter={(value: number) => formatCompactNumber(value)}
            width={56}
          />
          <Tooltip content={<SpreadTooltip />} cursor={{ stroke: SERIES_COLOR.grid, strokeDasharray: "3 3" }} />
          {observations.length > 0 && (
            <ReferenceLine
              y={0}
              stroke={SERIES_COLOR.zero}
              strokeDasharray="4 4"
              label={{ value: "0", position: "left", fill: SERIES_COLOR.axis, fontSize: 10 }}
            />
          )}
          <Line
            type="linear"
            dataKey="spread"
            name="spread (₹)"
            stroke={SERIES_COLOR.spread}
            strokeWidth={2}
            dot={{ r: 3, fill: SERIES_COLOR.spread, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={isAnimationActive}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
