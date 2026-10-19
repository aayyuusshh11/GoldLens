import { FIXTURE_META } from "../../lib/api/fixtures";
import { useReport } from "../../app/ReportContext";
import { StatusBadge } from "./Badges";

/**
 * Header pill describing the current data source, plus a live "refreshing"
 * indicator when cached data is being re-validated. Fixture data is always
 * labeled; never presented as live output.
 */
export function DataModePill() {
  const { source, health, entry } = useReport();

  let pill;
  if (source.mode === "fixture") {
    pill = (
      <StatusBadge
        tone="gold"
        title={`Fixture mode (VITE_DATA_MODE=fixture). Data is the bundled diagnostic sample (${FIXTURE_META.tradeDate}), not live market output.`}
      >
        Fixture · sample data
      </StatusBadge>
    );
  } else {
    switch (health.key) {
      case "ok":
        pill = <StatusBadge tone="pos" title={`Backend responded: ${health.detail ?? "ok"}`}>API live</StatusBadge>;
        break;
      case "checking":
        pill = <StatusBadge tone="mute">API connecting…</StatusBadge>;
        break;
      case "down":
        pill = <StatusBadge tone="neg" title={health.detail ?? "Backend did not respond."}>API problem</StatusBadge>;
        break;
      case "fixture":
        pill = undefined; // unreachable in live mode; kept for exhaustiveness
        break;
    }
  }

  const refreshing = entry.key === "ready" && entry.refreshing;

  return (
    <span className="flex items-center gap-2">
      {pill}
      {refreshing && (
        <StatusBadge tone="mute" title="A user-initiated refresh is in flight.">
          refreshing…
        </StatusBadge>
      )}
    </span>
  );
}
