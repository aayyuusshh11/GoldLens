import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApiProvider } from "../app/ApiContext";
import type { AppConfig } from "../lib/api/config";

/**
 * Shared test helpers. Fixture mode with ZERO artificial delay: the same
 * fixture resolvers the app ships with, so UI tests exercise the real data
 * pipeline instead of mocks that could drift from the settled API contract.
 */
export function makeApiConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: "fixture",
    baseUrl: null,
    defaultSymbol: "GOLDM",
    fixtureDelayMs: 0,
    ...overrides,
  };
}

export function renderWithApi(
  ui: ReactNode,
  options: { config?: AppConfig; route?: string } = {},
): ReturnType<typeof render> {
  const config = options.config ?? makeApiConfig();
  return render(
    <MemoryRouter initialEntries={[options.route ?? "/"]}>
      <ApiProvider config={config}>{ui}</ApiProvider>
    </MemoryRouter>,
  );
}
