import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

/** Empty state used wherever a series/table legitimately has nothing to show. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-line px-4 py-6">
      <div className="flex items-center gap-2 text-mute">
        <Inbox className="h-4 w-4 shrink-0" aria-hidden />
        <p className="font-semibold text-ink">{title}</p>
      </div>
      {body !== undefined && <div className="text-sm text-mute">{body}</div>}
      {action !== undefined && <div className="mt-1">{action}</div>}
    </div>
  );
}
