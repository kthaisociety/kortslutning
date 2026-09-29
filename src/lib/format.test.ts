import { describe, expect, it } from "vitest";
import { formatDateTime } from "./format";

describe("formatDateTime", () => {
  it("formats in Stockholm time as YYYY-MM-DD HH:MM", () => {
    expect(formatDateTime(new Date("2026-01-15T12:34:00Z"))).toBe("2026-01-15 13:34");
    expect(formatDateTime(new Date("2026-07-01T12:34:00Z"))).toBe("2026-07-01 14:34");
  });

  it("shows a dash for missing dates", () => {
    expect(formatDateTime(null)).toBe("—");
  });
});
