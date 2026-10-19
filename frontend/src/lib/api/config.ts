import type { ReportSymbol } from "../../types/api";

/**
 * Frontend runtime configuration — read once, cached. Only source is Vite
 * env vars (no secrets). The app NEVER silently downgrades from live mode to
 * fixture data: missing config in live mode is a hard configuration error
 * surfaced as a dedicated screen, not a fallback.
 */

export type DataMode = "fixture" | "live";

const KNOWN_SYMBOLS: readonly string[] = ["GOLD", "GOLDM"];

function parseDataMode(value: string | undefined): DataMode {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "live") return "live";
  // Unset or unrecognized → fixture. Explicit in README: the demo runs on the
  // supplied one-day diagnostic sample until the backend ships.
  return "fixture";
}

function parseDefaultSymbol(value: string | undefined): ReportSymbol {
  const normalized = (value ?? "").trim().toUpperCase();
  if (KNOWN_SYMBOLS.includes(normalized) && normalized === "GOLD") return "GOLD";
  return "GOLDM";
}

export interface AppConfig {
  mode: DataMode;
  /** null in fixture mode; required (non-null) in live mode. */
  baseUrl: string | null;
  defaultSymbol: ReportSymbol;
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

export function loadAppConfig(): AppConfig {
  const mode = parseDataMode(import.meta.env.VITE_DATA_MODE);
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");

  if (mode === "live" && baseUrl === "") {
    throw new ConfigError(
      "VITE_DATA_MODE=live requires VITE_API_BASE_URL (frontend/.env). The app will not silently fall back to fixture data.",
    );
  }

  return {
    mode,
    baseUrl: mode === "live" ? baseUrl : null,
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
