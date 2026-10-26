import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/react";
import { makeApiConfig, renderWithApi } from "../../test/helpers";
import { fixtureContracts } from "../../lib/api/fixtures";
import { EligibleContractsPage } from "./EligibleContractsPage";

describe("EligibleContractsPage — contract registry, verification first", () => {
  it("renders the honest registry title and every unverified row by default", async () => {
    renderWithApi(<EligibleContractsPage />, {
      config: makeApiConfig(),
      route: "/contracts",
    });
    expect(await screen.findByText("Contract registry — verification first")).toBeInTheDocument();
    const total = fixtureContracts().contracts.length; // fixture: 12 expiries
    // Wait for data (the header renders before the slice resolves).
    await screen.findByText("FUTCOM_GOLDM_20261105");
    expect(screen.getByText(new RegExp(`${total} of ${total} registry contracts match`))).toBeInTheDocument();
    const table = within(screen.getByRole("table"));
    expect(table.getAllByText("Unverified").length).toBe(total);
    // No 40-row cap needed under the fixture size.
    expect(screen.queryByText(/Show all/)).not.toBeInTheDocument();
    // Reason tokens actually present in the data (from pairs reason codes).
    expect(screen.getByText("unverified spec")).toBeInTheDocument();
  });

  it("filters by symbol while keeping the registry totals honest", async () => {
    const user = userEvent.setup();
    renderWithApi(<EligibleContractsPage />, { config: makeApiConfig(), route: "/contracts" });
    await screen.findByText("FUTCOM_GOLDM_20261105");
    await user.selectOptions(screen.getByLabelText(/symbol/i), "GOLD");
    expect(screen.getByText(/6 of 12 registry contracts match/)).toBeInTheDocument();
    expect(screen.queryByText("FUTCOM_GOLDM_20261105")).not.toBeInTheDocument();
    expect(screen.getByText("FUTCOM_GOLD_20261204")).toBeInTheDocument();
  });

  it("keeps the verification narrowing explicit: verified filter empties the fixture honestly", async () => {
    const user = userEvent.setup();
    renderWithApi(<EligibleContractsPage />, { config: makeApiConfig(), route: "/contracts" });
    await screen.findByText("FUTCOM_GOLDM_20261105");
    await user.selectOptions(screen.getByLabelText(/verification/i), "verified");
    expect(
      screen.getByText(/0 of 12 registry contracts match · 0 verified · 0 not verified/),
    ).toBeInTheDocument();
    expect(screen.getByText(/No contracts match/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/verification/i), "unverified");
    expect(within(screen.getByRole("table")).getAllByText("Unverified").length).toBe(12);
  });

  it("keeps last-good rows visible through a refresh", async () => {
    const user = userEvent.setup();
    // Slightly above zero so the transient "refreshing" notice is observable,
    // while staying a real fixture resolver (not a mock).
    renderWithApi(<EligibleContractsPage />, {
      config: makeApiConfig({ fixtureDelayMs: 400 }),
      route: "/contracts",
    });
    await screen.findByText("FUTCOM_GOLDM_20261105");
    await user.click(screen.getByRole("button", { name: /Refresh registry/ }));
    // Refresh marks the slice refreshing while data stays on screen.
    expect(screen.getByText(/Refreshing registry/)).toBeInTheDocument();
    await screen.findByText("FUTCOM_GOLDM_20261105");
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row").length).toBe(13); // header + 12
  });
});
