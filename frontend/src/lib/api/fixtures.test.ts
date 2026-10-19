import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./errors";
import { FIXTURE_META, fixtureRejectsSymbol, loadFixtureReport } from "./fixtures";
import { sampleReport } from "../../test/helpers";

describe("loadFixtureReport", () => {
  it("serves the bundled sample for GOLDM through the strict validator", async () => {
    const report = await loadFixtureReport("GOLDM", 0);
    expect(report.pair.near_expiry).toBe("2026-12-04");
    expect(report.pair.far_expiry).toBe("2027-01-05");
    expect(report.is_valid_backtest).toBe(false);
  });

  it("matches the sample report parsed directly (same source)", async () => {
    const viaFixture = await loadFixtureReport("GOLDM", 0);
    expect(viaFixture).toEqual(sampleReport());
  });

  it("mirrors the backend contract: rejecting families throw data_quality_rejected", async () => {
    const error = await loadFixtureReport("GOLD", 0).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    const appError = (error as ApiRequestError).appError;
    expect(appError.code).toBe("data_quality_rejected");
    expect(appError.kind).toBe("http");
    expect(appError.status).toBe(409);
    expect(appError.message).toContain("'GOLD'");
  });

  it("respects a pre-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await loadFixtureReport("GOLDM", 0, controller.signal).catch((e: unknown) => e);
    expect((error as ApiRequestError).appError.code).toBe("cancelled");
  });
});

describe("fixture metadata", () => {
  it("labels the sample honestly", () => {
    expect(fixtureRejectsSymbol("GOLD")).toBe(true);
    expect(fixtureRejectsSymbol("GOLDM")).toBe(false);
    expect(FIXTURE_META.tradeDate).toBe("2026-10-16");
    expect(FIXTURE_META.sourceFile).toContain("api_contract_sample.json");
    expect(FIXTURE_META.description).toMatch(/diagnostics/i);
  });
});
