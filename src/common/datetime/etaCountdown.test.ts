import { describe, expect, it } from "vitest";

import { describeEtaCountdown, type EtaSeverity } from "./etaCountdown";

describe("etaCountdown", () => {
  // Fixed reference point: July 24, 2026, 10:00 AM PST (5:00 PM UTC)
  const NOW = new Date("2026-07-24T17:00:00Z");

  describe("describeEtaCountdown", () => {
    describe("overdue (delta < 0)", () => {
      it("returns overdue by 1 day (singular)", () => {
        // Target: July 23, 2026 (1 day ago)
        const result = describeEtaCountdown("2026-07-23T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "overdue by 1 day",
          severity: "overdue",
          color: "#d13438",
        });
      });

      it("returns overdue by 3 days (plural)", () => {
        // Target: July 21, 2026 (3 days ago)
        const result = describeEtaCountdown("2026-07-21T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "overdue by 3 days",
          severity: "overdue",
          color: "#d13438",
        });
      });

      it("returns overdue by 30 days", () => {
        // Target: June 24, 2026 (30 days ago)
        const result = describeEtaCountdown("2026-06-24T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "overdue by 30 days",
          severity: "overdue",
          color: "#d13438",
        });
      });
    });

    describe("due today (delta === 0)", () => {
      it("returns due today when target is same PST day", () => {
        // Target: July 24, 2026 (today in PST)
        const result = describeEtaCountdown("2026-07-24T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "due today",
          severity: "soon",
          color: "#ca5010",
        });
      });

      it("returns due today even when target is late in the day", () => {
        // Target: July 24, 2026, 11:59 PM PST
        const result = describeEtaCountdown("2026-07-25T06:59:00Z", NOW);
        expect(result).toEqual({
          text: "due today",
          severity: "soon",
          color: "#ca5010",
        });
      });
    });

    describe("soon (0 < delta <= 6)", () => {
      it("returns in 1 day (singular)", () => {
        // Target: July 25, 2026 (tomorrow)
        const result = describeEtaCountdown("2026-07-25T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "in 1 day",
          severity: "soon",
          color: "#ca5010",
        });
      });

      it("returns in 2 days (plural)", () => {
        // Target: July 26, 2026
        const result = describeEtaCountdown("2026-07-26T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "in 2 days",
          severity: "soon",
          color: "#ca5010",
        });
      });

      it("returns in 6 days (boundary of soon)", () => {
        // Target: July 30, 2026
        const result = describeEtaCountdown("2026-07-30T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "in 6 days",
          severity: "soon",
          color: "#ca5010",
        });
      });
    });

    describe("upcoming (7 <= delta <= 27)", () => {
      it("returns in 1 week (exactly 7 days)", () => {
        // Target: July 31, 2026
        const result = describeEtaCountdown("2026-07-31T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "in 1 week",
          severity: "upcoming",
          color: "#c19c00",
        });
      });

      it("returns in 1 week 1 day (8 days)", () => {
        // Target: August 1, 2026
        const result = describeEtaCountdown("2026-08-01T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "in 1 week 1 day",
          severity: "upcoming",
          color: "#c19c00",
        });
      });

      it("returns in 2 weeks 3 days (17 days)", () => {
        // Target: August 10, 2026
        const result = describeEtaCountdown("2026-08-10T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "in 2 weeks 3 days",
          severity: "upcoming",
          color: "#c19c00",
        });
      });

      it("returns in 3 weeks (21 days)", () => {
        // Target: August 14, 2026
        const result = describeEtaCountdown("2026-08-14T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "in 3 weeks",
          severity: "upcoming",
          color: "#c19c00",
        });
      });

      it("returns in 3 weeks 6 days (27 days, boundary of upcoming)", () => {
        // Target: August 20, 2026
        const result = describeEtaCountdown("2026-08-20T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "in 3 weeks 6 days",
          severity: "upcoming",
          color: "#c19c00",
        });
      });
    });

    describe("distant (delta >= 28)", () => {
      it("returns in 4 weeks (28 days, boundary of distant)", () => {
        // Target: August 21, 2026
        const result = describeEtaCountdown("2026-08-21T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "in 4 weeks",
          severity: "distant",
          color: "#8a8886",
        });
      });

      it("returns in 8 weeks 2 days (58 days)", () => {
        // Target: September 20, 2026
        const result = describeEtaCountdown("2026-09-20T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "in 8 weeks 2 days",
          severity: "distant",
          color: "#8a8886",
        });
      });

      it("returns in 52 weeks (364 days, almost a year)", () => {
        // Target: July 23, 2027
        const result = describeEtaCountdown("2027-07-23T00:00:00Z", NOW);
        expect(result).toEqual({
          text: "in 52 weeks",
          severity: "distant",
          color: "#8a8886",
        });
      });
    });

    describe("invalid input", () => {
      it("returns empty text with distant severity for empty string", () => {
        const result = describeEtaCountdown("", NOW);
        expect(result).toEqual({
          text: "",
          severity: "distant",
          color: "#8a8886",
        });
      });

      it("returns empty text with distant severity for invalid ISO string", () => {
        const result = describeEtaCountdown("not-a-date", NOW);
        expect(result).toEqual({
          text: "",
          severity: "distant",
          color: "#8a8886",
        });
      });

      it("returns empty text with distant severity for malformed date", () => {
        const result = describeEtaCountdown("2026-99-99", NOW);
        expect(result).toEqual({
          text: "",
          severity: "distant",
          color: "#8a8886",
        });
      });
    });

    describe("determinism", () => {
      it("returns the same result for the same inputs", () => {
        const target = "2026-08-10T00:00:00Z";
        const result1 = describeEtaCountdown(target, NOW);
        const result2 = describeEtaCountdown(target, NOW);
        expect(result1).toEqual(result2);
      });

      it("handles time-of-day differences within the same PST day", () => {
        // Both 10:00 AM and 11:59 PM on July 24, 2026 PST should be "today"
        const morning = new Date("2026-07-24T17:00:00Z"); // 10:00 AM PST
        const night = new Date("2026-07-25T06:59:00Z"); // 11:59 PM PST
        const target = "2026-07-24T00:00:00Z";

        const result1 = describeEtaCountdown(target, morning);
        const result2 = describeEtaCountdown(target, night);

        expect(result1.text).toBe("due today");
        expect(result2.text).toBe("due today");
      });
    });

    describe("PST timezone handling", () => {
      it("correctly handles PST standard time (winter)", () => {
        // January 15, 2026, 10:00 AM PST (6:00 PM UTC)
        const winterNow = new Date("2026-01-15T18:00:00Z");
        // Target: January 16, 2026 (tomorrow)
        const result = describeEtaCountdown("2026-01-16T00:00:00Z", winterNow);
        expect(result).toEqual({
          text: "in 1 day",
          severity: "soon",
          color: "#ca5010",
        });
      });

      it("correctly handles PST daylight time (summer)", () => {
        // July 24, 2026, 10:00 AM PDT (5:00 PM UTC, -7 offset)
        const summerNow = new Date("2026-07-24T17:00:00Z");
        // Target: July 25, 2026 (tomorrow)
        const result = describeEtaCountdown("2026-07-25T00:00:00Z", summerNow);
        expect(result).toEqual({
          text: "in 1 day",
          severity: "soon",
          color: "#ca5010",
        });
      });
    });
  });

  describe("EtaSeverity type", () => {
    it("has the correct severity values", () => {
      const severities: EtaSeverity[] = ["overdue", "soon", "upcoming", "distant"];
      expect(severities).toHaveLength(4);
    });
  });
});
