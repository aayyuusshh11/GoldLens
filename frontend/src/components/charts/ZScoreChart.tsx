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
import { SERIES_COLOR, THRESHOLD } from "../../lib/charts/chartColors";
import type { StrategyConfigDTO, ZScorePointDTO } from "../../types/api";
import { ChartPanel } from "./ChartPanel";
import { ZScoreTooltip } from "./ChartTooltips";

const AXIS_TICK = { fill: SERIES_COLOR.axis, fontSize: 11 };
const GRID_LINE = { stroke: SERIES_COLOR.grid, strokeDasharray: "2 4" };
const isAnimationActive = false;

/**
 * Rolling z-score of the spread, with threshold reference lines sourced from
 * report.config (never invented). Null z values — insufficient rolling
 * history — leave gaps instead of drawing zero (SKILLS.md).
 */
export function ZScoreChart({
  points,
  config,
}: {
  points: ZScorePointDTO[];
  config: StrategyConfigDTO;
}) {
  const maxAbsZ = points.reduce((max, p) => {
    if (p.z === null) return max;
    return Math.max(max, Math.abs(p.z));
  }, 0);
  const bound = Math.max(config.stop_z, maxAbsZ) + 0.5;

  return (
    <ChartPanel
      title="Rolling z-score"
      question="How stretched is the spread versus its own recent history?"
      subtitle={`z of spread · lookback ${config.lookback_days}d · min history ${config.min_hist_days}d`}
      legend={[
        { color: SERIES_COLOR.z, label: "z (unitless)" },
        { color: THRESHOLD.entry, label: `entry threshold ±${config.z_entry}` },
        { color: THRESHOLD.stop, label: `stop threshold ±${config.stop_z}` },
      ]}
      footer={
        <span>
          Exit threshold z={config.z_exit} is applied by the strategy but not drawn.
          Gaps = rolling history insufficient (z not computed). Thresholds come from report.config.
        </span>
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
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
            domain={[-bound, bound]}
            width={48}
            tickFormatter={(value: number) => value.toFixed(1)}
          />
          <Tooltip content={<ZScoreTooltip />} cursor={{ stroke: SERIES_COLOR.grid, strokeDasharray: "3 3" }} />
          <ReferenceLine
            y={0}
            stroke={SERIES_COLOR.zero}
            strokeDasharray="4 4"
            label={{ value: "0", position: "left", fill: SERIES_COLOR.axis, fontSize: 10 }}
          />
          <ReferenceLine
            y={config.z_entry}
            stroke={THRESHOLD.entry}
            strokeDasharray="6 4"
            label={{
              value: `entry +${config.z_entry}`,
              position: "insideTopRight",
              fill: THRESHOLD.entry,
              fontSize: 10,
            }}
          />
          <ReferenceLine
            y={-config.z_entry}
            stroke={THRESHOLD.entry}
            strokeDasharray="6 4"
            label={{
              value: `entry −${config.z_entry}`,
              position: "insideBottomRight",
              fill: THRESHOLD.entry,
              fontSize: 10,
            }}
          />
          <ReferenceLine
            y={config.stop_z}
            stroke={THRESHOLD.stop}
            strokeDasharray="6 4"
            label={{
              value: `stop +${config.stop_z}`,
              position: "insideTopRight",
              fill: THRESHOLD.stop,
              fontSize: 10,
            }}
          />
          <ReferenceLine
            y={-config.stop_z}
            stroke={THRESHOLD.stop}
            strokeDasharray="6 4"
            label={{
              value: `stop −${config.stop_z}`,
              position: "insideBottomRight",
              fill: THRESHOLD.stop,
              fontSize: 10,
            }}
          />
          <Line
            type="linear"
            dataKey="z"
            name="z"
            stroke={SERIES_COLOR.z}
            strokeWidth={2}
            dot={{ r: 2.5, fill: SERIES_COLOR.z, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={isAnimationActive}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
