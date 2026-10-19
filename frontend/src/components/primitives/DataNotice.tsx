import type { ReactNode } from "react";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";

type NoticeTone = "warn" | "danger" | "info" | "pos";

const TONE: Record<NoticeTone, { border: string; icon: ReactNode }> = {
  warn: {
    border: "border-l-warn",
    icon: <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />,
  },
  danger: {
    border: "border-l-neg",
    icon: <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-neg" aria-hidden />,
  },
  info: {
    border: "border-l-mute",
    icon: <Info className="mt-0.5 h-4 w-4 shrink-0 text-mute" aria-hidden />,
  },
  pos: {
    border: "border-l-pos",
    icon: <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-pos" aria-hidden />,
  },
};

/**
 * Data-quality / caveat notice. Used for diagnostics-only runs, withheld net
 * metrics, stale data, missing endpoints and provenance caveats. role="status"
 * keeps such changes announceable without being intrusive.
 */
export function DataNotice({
  tone,
  title,
  children,
}: {
  tone: NoticeTone;
  title: string;
  children?: ReactNode;
}) {
  const styled = TONE[tone];
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg border border-line border-l-4 bg-surface px-4 py-3 ${styled.border}`}
    >
      {styled.icon}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {children !== undefined && <div className="mt-0.5 text-sm text-mute">{children}</div>}
      </div>
    </div>
  );
}
