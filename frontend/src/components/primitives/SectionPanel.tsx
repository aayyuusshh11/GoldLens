import type { ReactNode } from "react";

/**
 * Contained panel used sparingly — for charts, tables and metric groups.
 * SKILLS.md cautions against wrapping everything in cards; supporting text
 * flows as plain sections outside panels.
 */
export function SectionPanel({
  kicker,
  title,
  actions,
  caption,
  children,
  className = "",
}: {
  kicker?: string;
  title?: string;
  actions?: ReactNode;
  caption?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      {(title !== undefined || kicker !== undefined || actions !== undefined) && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3 md:px-5">
          <div className="min-w-0">
            {kicker !== undefined && (
              <p className="text-[11px] font-semibold uppercase tracking-widest text-mute">{kicker}</p>
            )}
            {title !== undefined && <h3 className="mt-0.5 text-sm font-semibold text-ink">{title}</h3>}
          </div>
          {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-4 py-4 md:px-5">{children}</div>
      {caption !== undefined && (
        <p className="border-t border-line px-4 py-2 text-xs text-mute md:px-5">{caption}</p>
      )}
    </section>
  );
}
