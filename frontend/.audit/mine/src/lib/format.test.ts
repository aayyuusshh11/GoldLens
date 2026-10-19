import { describe, expect, it } from "vitest";
import {
  NOT_AVAILABLE,
  formatInt,
  formatNumber,
  formatOrNA,
  formatPercentValue,
  formatRupees,
  formatDate,
  formatDateShort,
} from "./format";

describe("formatters — units, nulls and timezone-safety", () => {
  it("formats rupees with en-IN grouping and an explicit minus (₹ is INR)", () => {
    expect(formatRupees(1361)).toBe("₹1,361.00");
    expect(formatRupees(-12.5)).toBe("−₹12.50");
    expect(formatRupees(0)).toBe("₹0.00");
  });

  it("shows Not available for nulls and never substitutes zero", () => {
    expect(formatOrNA(null)).toBe(NOT_AVAILABLE);
    expect(formatOrNA(undefined, "Not computed")).toBe("Not computed");
    expect(formatOrNA(0)).toBe("0");
  });

  it("keeps integer and percent formatting locale-consistent", () => {
    expect(formatInt(168)).toBe("168");
    expect(formatNumber(1526.663)).toBe("1,526.66");
    expect(formatPercentValue(0.55)).toBe("55.00%");
  });

  it("formats plain ISO dates without timezone shift", () => {
    // Split-string formatting: identical output for any machine time zone.
    expect(formatDate("2026-10-16")).toBe("16 Oct 2026");
    expect(formatDate("2026-10-16T17:30:00+05:30")).toBe("16 Oct 2026");
    expect(formatDate(null)).toBe(NOT_AVAILABLE);
    expect(formatDate("garbage")).toBe(NOT_AVAILABLE);
    expect(formatDateShort("2026-10-16")).toBe("2026-10-16");
    expect(formatDateShort(undefined)).toBe("—");
  });
});
