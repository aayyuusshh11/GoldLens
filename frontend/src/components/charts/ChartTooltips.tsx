import type { TooltipProps } from "recharts";
import { formatDateShort, formatLots, formatPrice, formatRatio } from "../../lib/formatters/format";
import { SERIES_COLOR } from "../../lib/charts/chartColors";
import type { SpreadObservationDTO, ZScorePointDTO } from "../../types/api";

/**
 * Custom tooltips. Rows with a null value render "Not computed" — never 0 —
 * per SKILLS.md data rules.
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
      <dd className="font-mono tabular text-ink">{value ?? "Not computed"}</dd>
    </div>
  );
}

function titleFromLabel(label: TooltipProps<number, string>["label"]): string {
  if (typeof label === "string") return formatDateShort(label);
  if (typeof label === "number") return String(label);
  return "";
}

const num = (value: unknown): number | null => (typeof value === "number" ? value : null);

interface RowSpec {
  key: string;
  label: string;
  color: string;
  format: "price" | "ratio" | "lots";
}

function rowsFromPayload(
  payload: TooltipProps<number, string>["payload"],
  specs: RowSpec[],
): Array<{ label: string; color?: string; value: string | null }> {
  if (payload === undefined) return [];
  const byKey = new Map<string, { value: unknown; color?: string }>();
  for (const entry of payload) {
    const key = entry?.dataKey;
    if (typeof key === "string") byKey.set(key, { value: entry.value, color: entry.color });
  }
  return specs.map(({ key, label, color, format }) => {
    const found = byKey.get(key);
    const value = num(found?.value);
    const rendered =
      value === null
        ? null
        : format === "price"
          ? formatPrice(value)
          : format === "ratio"
            ? formatRatio(value)
            : formatLots(value);
    return { label, color: found?.color ?? color, value: rendered };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSpreadObservation(value: unknown): value is SpreadObservationDTO {
  return isRecord(value) && typeof value.stale === "boolean";
}

function isZPoint(value: unknown): value is ZScorePointDTO {
  return isRecord(value);
}

export function NearFarTooltip(props: TooltipProps<number, string>) {
  if (!props.active) return null;
  const rows = rowsFromPayload(props.payload, [
    { key: "near_close", label: "near close (₹)", color: SERIES_COLOR.near, format: "price" },
    { key: "far_close", label: "far close (₹)", color: SERIES_COLOR.far, format: "price" },
  ]);
  return (
    <div className={TOOLTIP_SHELL}>
      <p className="mb-1 font-semibold text-ink">{titleFromLabel(props.label)}</p>
      <dl className="space-y-1">
        {rows.map((row) => (
          <Row key={row.label} label={row.label} color={row.color} value={row.value} />
        ))}
      </dl>
    </div>
  );
}

export function SpreadTooltip(props: TooltipProps<number, string>) {
  if (!props.active) return null;
  const rows = rowsFromPayload(props.payload, [
    { key: "spread", label: "spread (₹)", color: SERIES_COLOR.spread, format: "price" },
  ]);
  const point = props.payload?.[0]?.payload;
  const stale = isSpreadObservation(point) && point.stale;
  return (
    <div className={TOOLTIP_SHELL}>
      <p className="mb-1 font-semibold text-ink">
        {titleFromLabel(props.label)}
        {stale && <span className="ml-2 text-[11px] font-semibold uppercase text-warn">stale</span>}
      </p>
      <dl className="space-y-1">
        {rows.map((row) => (
          <Row key={row.label} label={row.label} color={row.color} value={row.value} />
        ))}
      </dl>
    </div>
  );
}

export function ZScoreTooltip(props: TooltipProps<number, string>) {
  if (!props.active) return null;
  const rows = rowsFromPayload(props.payload, [
    { key: "z", label: "z", color: SERIES_COLOR.z, format: "ratio" },
    { key: "rolling_mean", label: "rolling mean (₹)", color: SERIES_COLOR.mean, format: "price" },
    { key: "rolling_std", label: "rolling std (₹)", color: SERIES_COLOR.mean, format: "price" },
  ]);
  const point = props.payload?.[0]?.payload;
  return (
    <div className={TOOLTIP_SHELL}>
      <p className="mb-1 font-semibold text-ink">{titleFromLabel(props.label)}</p>
      <dl className="space-y-1">
        {rows.map((row) => (
          <Row key={row.label} label={row.label} color={row.color} value={row.value} />
        ))}
      </dl>
      {isZPoint(point) && point.spread !== null && (
        <p className="mt-1 border-t border-line pt-1 text-mute">
          spread on date:{" "}
          <span className="font-mono tabular text-ink">{formatPrice(point.spread)}</span> (₹)
        </p>
      )}
    </div>
  );
}
