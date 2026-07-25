import { describe, expect, it } from "vitest";

import { formatPstDate, formatPstTime, formatPstTooltip } from "./pstDateTime";

describe("pstDateTime", () => {
  describe("formatPstDate", () => {
    it("formats a valid ISO timestamp as MM/DD/YYYY in PST", () => {
      // July 24, 2026, 3:30 PM UTC → 8:30 AM PST
      expect(formatPstDate("2026-07-24T15:30:00Z")).toBe("07/24/2026");
    });

    it("formats a winter date correctly (PST standard time)", () => {
      // January 15, 2026, 8:00 AM UTC → 12:00 AM PST (previous day due to -8 offset)
      // Actually, 8:00 AM UTC on Jan 15 → 0:00 AM PST Jan 15 (midnight), so still Jan 15
      expect(formatPstDate("2026-01-15T08:00:00Z")).toBe("01/15/2026");
    });

    it("formats a date near midnight PST correctly", () => {
      // 2026-07-24 at 07:59:59 UTC → 00:59:59 PST same day (during PDT, -7 offset)
      expect(formatPstDate("2026-07-24T07:59:59Z")).toBe("07/24/2026");
      // 2026-07-24 at 08:00:00 UTC → 01:00:00 PST same day
      expect(formatPstDate("2026-07-24T08:00:00Z")).toBe("07/24/2026");
    });

    it("returns empty string for empty input", () => {
      expect(formatPstDate("")).toBe("");
    });

    it("returns empty string for invalid ISO string", () => {
      expect(formatPstDate("not-a-date")).toBe("");
      expect(formatPstDate("2026-99-99")).toBe("");
    });
  });

  describe("formatPstTime", () => {
    it("formats a valid ISO timestamp as h:mm AM/PM in PST", () => {
      // July 24, 2026, 3:30 PM UTC → 8:30 AM PST
      expect(formatPstTime("2026-07-24T15:30:00Z")).toBe("8:30 AM");
    });

    it("formats afternoon time correctly", () => {
      // July 24, 2026, 11:45 PM UTC → 4:45 PM PST
      expect(formatPstTime("2026-07-24T23:45:00Z")).toBe("4:45 PM");
    });

    it("formats midnight correctly", () => {
      // July 24, 2026, 07:00:00 UTC → 12:00 AM PST (midnight PST)
      expect(formatPstTime("2026-07-24T07:00:00Z")).toBe("12:00 AM");
    });

    it("formats noon correctly", () => {
      // July 24, 2026, 19:00:00 UTC → 12:00 PM PST (noon PST)
      expect(formatPstTime("2026-07-24T19:00:00Z")).toBe("12:00 PM");
    });

    it("returns empty string for empty input", () => {
      expect(formatPstTime("")).toBe("");
    });

    it("returns empty string for invalid ISO string", () => {
      expect(formatPstTime("invalid")).toBe("");
    });
  });

  describe("formatPstTooltip", () => {
    it("formats a valid ISO timestamp as date @ time PST", () => {
      // July 24, 2026, 3:30 PM UTC → 07/24/2026 @ 8:30 AM PST
      expect(formatPstTooltip("2026-07-24T15:30:00Z")).toBe("07/24/2026 @ 8:30 AM PST");
    });

    it("formats an afternoon time correctly", () => {
      // July 24, 2026, 11:45 PM UTC → 07/24/2026 @ 4:45 PM PST
      expect(formatPstTooltip("2026-07-24T23:45:00Z")).toBe("07/24/2026 @ 4:45 PM PST");
    });

    it("returns empty string for empty input", () => {
      expect(formatPstTooltip("")).toBe("");
    });

    it("returns empty string for invalid ISO string", () => {
      expect(formatPstTooltip("not-a-date")).toBe("");
    });
  });
});
