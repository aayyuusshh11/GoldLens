/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "fixture" (default) | "live" */
  readonly VITE_DATA_MODE?: string;
  /** Required when VITE_DATA_MODE=live. Base URL of the backend API. */
  readonly VITE_API_BASE_URL?: string;
  /** Default symbol family on first load ("GOLD" | "GOLDM"). */
  readonly VITE_DEFAULT_SYMBOL?: string;
  /** Simulated latency (ms) in fixture mode, 0–5000. */
  readonly VITE_FIXTURE_DELAY_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
