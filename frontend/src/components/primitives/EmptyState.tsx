import type { ReactNode } from "react";

/**
 * Honest empty state: explains WHY there is nothing and what would change it.
 * Never renders fabricated placeholder numbers.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-line bg-elevated px-5 py-8 text-center"
    >
      <p className="text-sm font-medium text-ink">{title}</p>
      {children ? (
        <p className="mx-auto mt-1.5 max-w-prose text-sm text-mute">{children}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
