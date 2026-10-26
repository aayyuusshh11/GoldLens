import { FIXTURE_META } from "../../lib/api/fixtures";
import { useApi } from "../../app/ApiContext";
import { StatusBadge } from "./Badges";

/**
 * Header pill describing the current data source, plus a live "refreshing"
 * indicator when user-initiated refreshes are in flight. Fixture data is
 * always labeled; never presented as live output.
 */
export function DataModePill() {
  const { source, health, dq, contracts, pairs } = useApi();

  let pill;
  if (source.mode === "fixture") {
    pill = (
      <StatusBadge
        tone="gold"
        title={`Fixture mode (VITE_DATA_MODE=fixture). Data mirrors the real backend's 1-trading-day ingest (fixture date ${FIXTURE_META.tradeDate}), not live market output.`}
      >
        Fixture · sample data
      </StatusBadge>
    );
  } else {
    switch (health.key) {
      case "ok":
        pill = (
          <StatusBadge tone="pos" title={`Backend responded: ${health.detail ?? "ok"}`}>
            API live
          </StatusBadge>
        );
        break;
      case "checking":
        pill = <StatusBadge tone="mute">API connecting…</StatusBadge>;
        break;
      case "down":
        pill = (
          <StatusBadge tone="neg" title={health.detail ?? "Backend did not respond."}>
            API problem
          </StatusBadge>
        );
        break;
      case "fixture":
        pill = undefined; // unreachable in live mode; kept for exhaustiveness
        break;
    }
  }

  const refreshing = dq.refreshing || contracts.refreshing || pairs.refreshing;

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
