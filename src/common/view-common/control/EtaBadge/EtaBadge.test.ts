import { describe, expect, it } from "vitest";

import { renderEtaBadge } from "./EtaBadge";

describe("renderEtaBadge", () => {
  const now = new Date("2026-07-24T10:00:00-07:00");

  it("renders 'No ETA' when eta is null", () => {
    const badge = renderEtaBadge(document, { eta: null, now });

    expect(badge.textContent).toBe("No ETA");
    expect(badge.style.color).toBe("var(--text-secondary-color, #8a8886)");
    expect(badge.title).toBe("");
  });

  it("renders 'No ETA' when eta is empty string", () => {
    const badge = renderEtaBadge(document, { eta: "", now });

    expect(badge.textContent).toBe("No ETA");
    expect(badge.style.color).toBe("var(--text-secondary-color, #8a8886)");
  });

  it("renders the ETA date with severity color for overdue", () => {
    // 3 days ago → overdue (use PST/PDT time to avoid timezone conversion issues)
    const badge = renderEtaBadge(document, { eta: "2026-07-21T00:00:00-07:00", now });

    expect(badge.textContent).toContain("ETA 07/21/2026");
    expect(badge.style.color).toBe("rgb(209, 52, 56)"); // #d13438 as rgb
    expect(badge.dataset.severity).toBe("overdue");
    expect(badge.title).toContain("overdue");
  });

  it("renders the ETA date with severity color for soon", () => {
    // 2 days from now → soon
    const badge = renderEtaBadge(document, { eta: "2026-07-26T00:00:00-07:00", now });

    expect(badge.textContent).toContain("ETA 07/26/2026");
    expect(badge.style.color).toBe("rgb(202, 80, 16)"); // #ca5010 as rgb
    expect(badge.dataset.severity).toBe("soon");
    expect(badge.title).toContain("in 2 days");
  });

  it("renders the ETA date with severity color for upcoming", () => {
    // 17 days from now → upcoming
    const badge = renderEtaBadge(document, { eta: "2026-08-10T00:00:00-07:00", now });

    expect(badge.textContent).toContain("ETA 08/10/2026");
    expect(badge.style.color).toBe("rgb(193, 156, 0)"); // #c19c00 as rgb
    expect(badge.dataset.severity).toBe("upcoming");
    expect(badge.title).toContain("in 2 weeks 3 days");
  });

  it("renders the ETA date with severity color for distant", () => {
    // 50 days from now → distant
    const badge = renderEtaBadge(document, { eta: "2026-09-12T00:00:00-07:00", now });

    expect(badge.textContent).toContain("ETA 09/12/2026");
    expect(badge.style.color).toBe("rgb(138, 136, 134)"); // #8a8886 as rgb
    expect(badge.dataset.severity).toBe("distant");
  });

  it("sets the countdown text as the tooltip", () => {
    const badge = renderEtaBadge(document, { eta: "2026-07-26T00:00:00Z", now });

    expect(badge.title).toBe("in 2 days");
  });

  it("sets the class for styling hooks", () => {
    const badge = renderEtaBadge(document, { eta: "2026-07-26T00:00:00Z", now });

    expect(badge.className).toBe("awesomeado-eta");
  });
});
