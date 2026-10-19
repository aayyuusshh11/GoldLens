import { describe, expect, it } from "vitest";
import {
  formatCompactNumber,
  formatDateShort,
  formatDateTick,
  formatInt,
  formatPrice,
  formatRatio,
  formatRupees,
  formatSignedRupees,
  isoToEpochDays,
} from "./format";

const NBSP = /\u00A0/g;

describe("number formatting (en-IN)", () => {
  it("groups digits in the Indian convention", () => {
    expect(formatPrice(147866)).toBe("1,47,866.00");
    expect(formatPrice(1361)).toBe("1,361.00");
    expect(formatPrice(0)).toBe("0.00");
    expect(formatPrice(-1234.5)).toBe("-1,234.50");
  });

  it("formats integers without decimals", () => {
    expect(formatInt(145)).toBe("145");
    expect(formatInt(1234567)).toBe("12,34,567");
  });

  it("formats unit-less ratios with up to 4 decimals", () => {
    expect(formatRatio(1.5)).toBe("1.5");
    expect(formatRatio(0.123456)).toBe("0.1235");
  });

  it("prefixes rupee values with ₹ and keeps tabular spacing", () => {
    expect(formatRupees(147866).replace(NBSP, " ")).toBe("₹ 1,47,866.00");
  });

  it("signs positive and negative rupee values distinctly", () => {
    expect(formatSignedRupees(1234.5).replace(NBSP, " ")).toBe("+ ₹ 1,234.50");
    expect(formatSignedRupees(-1234.5).replace(NBSP, " ")).toBe("- ₹ 1,234.50");
    expect(formatSignedRupees(0).replace(NBSP, " ")).toBe("₹ 0.00");
  });

  it("compacts large numbers for axes without crashing", () => {
    expect(formatCompactNumber(0)).toBe("0");
    expect(typeof formatCompactNumber(147866)).toBe("string");
    expect(formatCompactNumber(147866).length).toBeGreaterThan(0);
  });
});

describe("ISO date formatting (manual parsing, UTC-safe)", () => {
  it("renders short dates as DD Mon YYYY", () => {
    expect(formatDateShort("2026-10-16")).toBe("16 Oct 2026");
    expect(formatDateShort("2027-01-05")).toBe("5 Jan 2027");
  });

  it("renders axis ticks as DD Mon", () => {
    expect(formatDateTick("2026-10-16")).toBe("16 Oct");
  });

  it("returns the raw string for unparseable input (honest fallback)", () => {
    expect(formatDateShort("not-a-date")).toBe("not-a-date");
    expect(formatDateShort("2026-13-45")).toBe("2026-13-45");
  });

  it("renders null/undefined as — nowhere", () => {
    expect(formatDateShort(null)).toBe("—");
    expect(formatDateShort(undefined)).toBe("—");
    expect(formatDateTick(null)).toBe("");
  });

  it("converts ISO dates to epoch days without timezone drift", () => {
    expect(isoToEpochDays("1970-01-01")).toBe(0);
    expect(isoToEpochDays("1970-01-02")).toBe(1);
    expect(isoToEpochDays("2026-10-16")! - isoToEpochDays("2026-10-15")!).toBe(1);
  });
});
