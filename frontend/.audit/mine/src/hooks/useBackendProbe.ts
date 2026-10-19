import { useCallback, useEffect, useRef, useState } from "react";
import { createApiClient } from "@/lib/api/endpoints";
import { describeError } from "@/lib/api/errors";
import { resolveBaseUrl } from "@/lib/api/config";

export type BackendProbeState =
  | { state: "idle" }
  | { state: "checking" }
  | /** a route answered 2xx — NOT a confirmation of the full contract */ { state: "reachable" }
  | { state: "unreachable"; message: string };

/**
 * Phase 4 probe of the PROPOSED `GET /api/health` route.
 *
 * Purpose: give the Overview an honest connectivity statement:
 * - reachable    → "a route answered; contract still unconfirmed"
 * - unreachable  → the exact client-side view of why (not running / CORS / URL)
 * Results are user-triggered (probe()), never automatic noise, and are
 * cancelled on unmount. No data is claimed beyond the HTTP status.
 */
export function useBackendProbe() {
  const [state, setState] = useState<BackendProbeState>({ state: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const probe = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ state: "checking" });

    const { getHealth } = createApiClient(resolveBaseUrl(import.meta.env.VITE_API_BASE_URL));
    getHealth({ signal: controller.signal, timeoutMs: 5000 })
      .then(() => {
        if (!controller.signal.aborted) setState({ state: "reachable" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const apiError = describeError(error);
        setState({
          state: "unreachable",
          message:
            apiError.kind === "http"
              ? `Server answered ${apiError.statusCode} on the proposed /api/health route (${apiError.message})`
              : apiError.message,
        });
      });
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { state, probe };
}
