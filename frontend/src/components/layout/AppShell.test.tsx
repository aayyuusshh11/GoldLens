import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "./AppShell";
import { makeApiConfig, renderWithApi } from "../../test/helpers";

describe("AppShell (fixture mode)", () => {
  it("renders the fixture pill, brand, reload control and page body", async () => {
    renderWithApi(
      <AppShell>
        <p>page body</p>
      </AppShell>,
      { config: makeApiConfig() },
    );

    expect(screen.getByText(/Fixture · sample data/i)).toBeTruthy();
    expect(screen.getByText("GoldLens")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reload all data/i })).toBeTruthy();
    expect(screen.getByText("page body")).toBeTruthy();
    expect(screen.getByText(/data source: bundled fixture dataset/)).toBeTruthy();

    // Fixture symbols surface from the loaded pair set shortly after mount.
    await screen.findByRole("option", { name: "GOLD" });
  });

  it("switches symbol families and keeps the open symbol set derived from data", async () => {
    const user = userEvent.setup();
    renderWithApi(
      <AppShell>
        <p>page body</p>
      </AppShell>,
      { config: makeApiConfig({ defaultSymbol: "GOLDM" }) },
    );

    const select = (await screen.findByRole("combobox", {
      name: /Contract family/i,
    })) as HTMLSelectElement;

    // Fixture pairs resolve to GOLDM (5) + GOLD (5).
    await waitFor(() => {
      const options = Array.from(select.options).map((option) => option.value);
      expect(options).toEqual(expect.arrayContaining(["GOLD", "GOLDM"]));
    });

    await user.selectOptions(select, "GOLD");
    expect(select.value).toBe("GOLD");
    await screen.findByText("5 pairs");
  });
});
