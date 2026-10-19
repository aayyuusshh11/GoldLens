/** Simple bulleted list of reason strings (rationale, filter reasons…). */
export function ReasonList({
  items,
  empty = "No reason recorded.",
}: {
  items: Array<string | null | undefined>;
  empty?: string;
}) {
  const kept = items.filter((item): item is string => item !== null && item !== undefined && item !== "");
  if (kept.length === 0) {
    return <p className="text-sm text-mute">{empty}</p>;
  }
  return (
    <ul className="list-none space-y-1">
      {kept.map((item, index) => (
        <li key={`${index}-${item.slice(0, 16)}`} className="flex items-start gap-2 text-sm text-mute">
          <span aria-hidden className="mt-[0.45rem] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
