/**
 * A plain definition list for config/provenance/metric key–value rows.
 * Values render verbatim; units and caveats come from the caller.
 * Missing values must already be formatted as "Not available" upstream.
 */
export function DetailRows({
  rows,
  className,
}: {
  rows: readonly (readonly [label: string, value: React.ReactNode])[];
  className?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-mute">Not available.</p>;
  }
  return (
    <dl className={className}>
      {rows.map(([label, value], i) => (
        <div
          key={`${label}-${i}`}
          className="flex items-baseline justify-between gap-6 py-1.5 border-b border-line/60 last:border-b-0"
        >
          <dt className="shrink-0 text-sm text-mute">{label}</dt>
          <dd className="min-w-0 text-right text-sm text-ink data-font [&_span]:data-font">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
