/**
 * Skeleton loading states that placeholder the real layout (SKILLS.md).
 * Animation is disabled under prefers-reduced-motion (globals.css).
 */
export function LoadingState({
  label = "Loading report…",
  rows = 4,
  wide = false,
}: {
  label?: string;
  rows?: number;
  wide?: boolean;
}) {
  const widths = ["70%", "55%", "85%", "40%", "65%", "50%", "75%", "45%"];
  return (
    <div role="status" aria-busy="true" aria-label={label} className={wide ? "" : "max-w-xl"}>
      <div className="skeleton mb-3 h-8 w-1/3" />
      <div className="skeleton mb-3 h-4 w-2/3" />
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => {
          const width = widths[i % widths.length] ?? "50%";
          return <div key={i} className="skeleton h-4" style={{ width }} />;
        })}
      </div>
    </div>
  );
}

/** Skeleton strip matching a metrics grid. */
export function LoadingMetricGrid({ columns = 4 }: { columns?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading metrics…"
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: columns * 2 }, (_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-line bg-surface p-3">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-5 w-24" />
        </div>
      ))}
    </div>
  );
}
