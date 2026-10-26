/**
 * Frontend runtime configuration — read once, cached. Only source is Vite
 * env vars (no secrets).
 *
 * Mode rules (no silent fallbacks):
 *  - VITE_DATA_MODE=fixture (unset also → fixture) → bundled diagnostic
 *    fixtures that mirror the real backend's 1-trading-day responses.
 *  - VITE_DATA_MODE=live → the real backend. An EMPTY VITE_API_BASE_URL is
 *    legal and means same-origin requests through the Vite dev proxy
 *    (`/api` → 127.0.0.1:8000, see vite.config.ts).
 *
 * The app never downgrades live → fixture, ever. Failures render as errors.
 */

export type DataMode = "fixture" | "live";

/**
 * Symbol filter identity — an OPEN string. Symbols come from ingested data
 * (GET /api/pairs, GET /api/contracts); no closed enum is hardcoded.
 */
export type SymbolKey = string;

function parseDataMode(value: string | undefined): DataMode {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "live") return "live";
  return "fixture";
}

/** Symbols are uppercase open strings; a blank value stays blank. */
function parseDefaultSymbol(value: string | undefined): SymbolKey {
  return (value ?? "").trim().toUpperCase();
}

export interface AppConfig {
  mode: DataMode;
  /** null in fixture mode; "" (same-origin) or explicit URL in live mode. */
  baseUrl: string | null;
  defaultSymbol: SymbolKey;
  /** Simulated latency in fixture mode (0–5000 ms), for loading skeletons. */
  fixtureDelayMs: number;
}

export class ConfigError extends Error {
  readonly title = "Frontend configuration error";

  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function clampDelay(raw: string | undefined): number {
  const parsed = Number(raw ?? "250");
  if (!Number.isFinite(parsed) || parsed < 0) return 250;
  return Math.round(Math.min(parsed, 5000));
}

/**
 * Note: live mode never requires an explicit URL — same-origin through the
 * Vite dev proxy is the supported zero-config path for local development.
 */
export function loadAppConfig(): AppConfig {
  const mode = parseDataMode(import.meta.env.VITE_DATA_MODE);
  const rawUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
  return {
    mode,
    baseUrl: mode === "live" ? rawUrl : null,
    defaultSymbol: parseDefaultSymbol(import.meta.env.VITE_DEFAULT_SYMBOL),
    fixtureDelayMs: clampDelay(import.meta.env.VITE_FIXTURE_DELAY_MS),
  };
}

let cached: AppConfig | null = null;

/** Cached accessor; ConfigError propagates to App's config error screen. */
export function appConfig(): AppConfig {
  cached ??= loadAppConfig();
  return cached;
}
