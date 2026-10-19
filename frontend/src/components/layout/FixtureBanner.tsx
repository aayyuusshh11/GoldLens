import { FIXTURE_META } from "../../lib/api/fixtures";

/** Global, always-visible notice while fixture mode is enabled. */
export function FixtureBanner() {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3">
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-gold text-[9px] font-bold leading-none text-gold"
      >
        i
      </span>
      <div>
        <p className="text-sm font-semibold text-gold">
          Fixture mode — bundled diagnostic sample (1 trading day, {FIXTURE_META.tradeDate})
        </p>
        <p className="mt-0.5 text-sm text-mute">
          {FIXTURE_META.description} Source: <span className="font-mono">{FIXTURE_META.sourceFile}</span>. Set{" "}
          <span className="font-mono">VITE_DATA_MODE=live</span> and start the backend to view live API output.
        </p>
      </div>
    </div>
  );
}
