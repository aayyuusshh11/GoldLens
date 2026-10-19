import type { ReactNode } from "react";
import { formatCompactNumber } from "../../lib/formatters/format";

/** Chart panel: one question, one chart, real units. */
export function ChartPanel({
  title,
  question,
  subtitle,
  legend,
  footer,
  children,
  className = "",
}: {
  title: string;
  question?: string;
  subtitle?: string;
  legend?: Array<{ color: string; label: string }>;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {subtitle !== undefined && <p className="mt-0.5 text-xs text-mute">{subtitle}</p>}
        </div>
        {question !== undefined && (
          <p className="max-w-[26rem] text-right text-xs italic text-mute">Q: {question}</p>
        )}
      </header>
      <div className="px-1 py-3 md:px-2">{children}</div>
      {(legend !== undefined || footer !== undefined) && (
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-xs text-mute">
          {legend?.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
          {footer}
        </footer>
      )}
    </section>
  );
}

/** Compact en-IN axis numbers (1.48L) — keeps value axes readable. */
export function formatAxisNumber(value: number): string {
  return formatCompactNumber(value);
}
