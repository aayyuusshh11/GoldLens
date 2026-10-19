import type { ReactNode } from "react";

/**
 * Page header: compact kicker + h1 + one-line subtitle. Space is reserved for
 * analysis, not decoration (SKILLS.md).
 */
export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {kicker !== undefined && (
          <p className="text-[11px] font-semibold uppercase tracking-widest text-mute">{kicker}</p>
        )}
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle !== undefined && <p className="mt-1 max-w-2xl text-sm text-mute">{subtitle}</p>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
