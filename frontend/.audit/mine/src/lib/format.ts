/**
 * Formatting helpers — RULES (skills.md §7):
 * - Units live with the caller; these helpers format values only.
 * - Missing is never zero: pass through `---` labels from `formatOrNA`.
 * - Dates are plain `YYYY-MM-DD` strings from the API; parsed without timezone
 *   shifts (split-string parts, never `new Date(isoString)` UTC conversion).
 */

export const NOT_AVAILABLE = "Not available";
export const NOT_COMPUTED = "Not computed";

/** Human label for null values. Callers may prefer NOT_COMPUTED for derived math. */
export function formatOrNA(
  value: number | null | undefined,
  label: string = NOT_AVAILABLE,
): string {
  return value === null || value === undefined || Number.isNaN(value)
    ? label
    : String(value);
}

const MAX_SANE_DECIMALS = 6;

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return NOT_AVAILABLE;
  const abs = Math.abs(value);
  const decimals =
    abs > 0 && abs < 1
      ? Math.min(MAX_SANE_DECIMALS, Math.ceil(-Math.log10(abs)) + 1)
      : 2;
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: Math.min(decimals, 2),
    maximumFractionDigits: decimals,
  });
}

export function formatInt(value: number): string {
  if (!Number.isFinite(value)) return NOT_AVAILABLE;
  return value.toLocaleString("en-IN");
}

/** Indian rupee money formatting: ₹ + en-IN grouping, 2dp. */
export function formatRupees(value: number): string {
  if (!Number.isFinite(value)) return NOT_AVAILABLE;
  const sign = value < 0 ? "\u2212" : "";
  return `${sign}\u20B9${Math.abs(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercentValue(value: number): string {
  if (!Number.isFinite(value)) return NOT_AVAILABLE;
  return `${(value * 100).toFixed(2)}%`;
}

/** Plain-date formatting with no timezone drift (input: `YYYY-MM-DD` or empty). */
export function formatDate(
  iso: string | null | undefined,
  fallback: string = NOT_AVAILABLE,
): string {
  if (!iso || typeof iso !== "string" || iso.length < 10) return fallback;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return fallback;
  const month = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][m - 1];
  return `${d} ${month} ${y}`;
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return "—";
  return iso.slice(0, 10);
}

/** "16 Oct 2026 – 16 Oct 2026" honest range; open ends render as unknown side. */
export function dateRangeLabel(range: readonly (string | null)[] | undefined | null): string {
  if (!range || range.length !== 2) return NOT_AVAILABLE;
  const [a, b] = range;
  if (!a && !b) return NOT_AVAILABLE;
  if (!a) return `until ${formatDate(b)}`;
  if (!b) return `from ${formatDate(a)}`;
  return `${formatDate(a)} – ${formatDate(b)}`;
}
