/**
 * Formatting helpers. Indian market conventions: ₹ prices, en-IN digit
 * grouping (1,47,866.00), ISO dates "YYYY-MM-DD". Date handling is manual
 * text parsing — no timezone drift. Formatters never see null: <MetricValue>
 * owns the "unavailable" path; null is not this layer's job.
 */

type FormatterOptions = { minimumFractionDigits?: number; maximumFractionDigits?: number };

const formatterCache = new Map<string, Intl.NumberFormat>();

function cachedFormatter(opts: FormatterOptions): Intl.NumberFormat {
  const minDigits = opts.minimumFractionDigits ?? 0;
  const key = `${minDigits}:${opts.maximumFractionDigits ?? 2}`;
  const existing = formatterCache.get(key);
  if (existing) return existing;
  const created = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
  });
  formatterCache.set(key, created);
  return created;
}

export function formatPrice(value: number): string {
  return cachedFormatter({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function formatLots(value: number): string {
  return cachedFormatter({ maximumFractionDigits: 2 }).format(value);
}

export function formatInt(value: number): string {
  return cachedFormatter({ maximumFractionDigits: 0 }).format(value);
}

/** Unit-less ratio (win_rate, sharpe). Scale is pending quant confirmation. */
export function formatRatio(value: number): string {
  return cachedFormatter({ maximumFractionDigits: 4 }).format(value);
}

export function formatLakhs(value: number): string {
  return cachedFormatter({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function formatRupees(value: number): string {
  return `₹\u00A0${formatPrice(value)}`;
}

export function formatSignedRupees(value: number): string {
  if (value > 0) return `+\u00A0${formatRupees(value)}`;
  if (value < 0) return `-\u00A0₹\u00A0${formatPrice(Math.abs(value))}`;
  return formatRupees(value);
}

/** Compact en-IN axis formatting, e.g. 1,47,866 → "1.48L", 1,265 → "1.27K". */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function isoParts(iso: string): { y: number; m: number; d: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** "2026-10-16" → "16 Oct 2026". Unparseable input returns raw (honest fallback). */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parts = isoParts(iso);
  if (parts === null) return iso;
  const month = MONTHS[parts.m - 1];
  if (month === undefined) return iso;
  return `${parts.d} ${month} ${parts.y}`;
}

/** Compact axis label: "16 Oct". */
export function formatDateTick(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = isoParts(iso);
  if (parts === null) return iso;
  const month = MONTHS[parts.m - 1];
  if (month === undefined) return iso;
  return `${parts.d} ${month}`;
}

/** Epoch-days for gap analysis (timezone-free). */
export function isoToEpochDays(iso: string): number | null {
  const parts = isoParts(iso);
  if (parts === null) return null;
  return Math.round(Date.UTC(parts.y, parts.m - 1, parts.d) / 86_400_000);
}
