import { cn } from "@/lib/utils";

/**
 * Line-based loading skeleton (settled document shimmer). Resembles the page's
 * real layout loosely — deliberately not decorated.
 */
export function LoadingSkeleton({
  lines = 3,
  label = "Loading content",
  className,
}: {
  lines?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="skeleton h-4"
          style={{ width: `${100 - ((i * 13) % 31)}%` }}
        />
      ))}
    </div>
  );
}
