import { describe, expect, it } from "vitest";

import { renderEtaBadge } from "./EtaBadge";

// A fixed clock keeps severity/countdown assertions deterministic across every describe below.
const now = new Date("2026-07-24T10:00:00-07:00");

describe("renderEtaBadge - rendering and severity", () => {
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

describe("renderEtaBadge - editing interactions", () => {
  it("uses a default cursor and stays read-only when no onChange is provided", () => {
    const badge = renderEtaBadge(document, { eta: "2026-07-26T00:00:00Z", now });

    expect(badge.style.cursor).toBe("default");

    // A read-only badge never opens a picker on click.
    const label = badge.querySelector<HTMLElement>(".awesomeado-eta__label");
    label?.click();
    expect(badge.querySelector(".awesomeado-eta__date")).toBeNull();
  });

  it("uses a pointer cursor when editable", () => {
    const badge = renderEtaBadge(document, { eta: null, now, onChange: () => {} });

    expect(badge.style.cursor).toBe("pointer");
  });

  it("renders an overdue ETA in bold and a non-overdue one at normal weight", () => {
    const overdue = renderEtaBadge(document, { eta: "2026-07-21T00:00:00-07:00", now });
    expect(overdue.style.fontWeight).toBe("bold");

    const upcoming = renderEtaBadge(document, { eta: "2026-08-10T00:00:00-07:00", now });
    expect(upcoming.style.fontWeight).toBe("normal");
  });

  it("opens a date-picker popup on click when editable", () => {
    const badge = renderEtaBadge(document, { eta: null, now, onChange: () => {} });
    document.body.append(badge);

    const label = badge.querySelector<HTMLElement>(".awesomeado-eta__label");
    label?.click();

    expect(badge.querySelector(".awesomeado-eta__date")).toBeTruthy();

    badge.remove();
  });

  it("calls onChange with a noon-UTC ISO timestamp when a date is typed", () => {
    const picks: Array<string | null> = [];
    const badge = renderEtaBadge(document, {
      eta: null,
      now,
      onChange: (eta) => picks.push(eta),
    });
    document.body.append(badge);

    const label = badge.querySelector<HTMLElement>(".awesomeado-eta__label");
    label?.click();

    const input = badge.querySelector<HTMLInputElement>(".awesomeado-eta__date");
    expect(input).toBeTruthy();
    input!.value = "2026-09-01";
    input!.dispatchEvent(new Event("change"));

    // Noon UTC keeps the picked calendar day intact when rendered back in PST.
    expect(picks).toEqual(["2026-09-01T12:00:00Z"]);
    // Picking dismisses the popup.
    expect(badge.querySelector(".awesomeado-eta__date")).toBeNull();

    badge.remove();
  });

  it("treats an emptied date field as a clear", () => {
    const picks: Array<string | null> = [];
    const badge = renderEtaBadge(document, {
      eta: "2026-08-10T00:00:00-07:00",
      now,
      onChange: (eta) => picks.push(eta),
    });
    document.body.append(badge);

    badge.querySelector<HTMLElement>(".awesomeado-eta__label")?.click();
    const input = badge.querySelector<HTMLInputElement>(".awesomeado-eta__date");
    input!.value = "";
    input!.dispatchEvent(new Event("change"));

    expect(picks).toEqual([null]);

    badge.remove();
  });
});

describe("renderEtaBadge - calendar, clearing and reflecting", () => {
  it("keeps the themed calendar hidden until its button is clicked", () => {
    const badge = renderEtaBadge(document, { eta: null, now, onChange: () => {} });
    document.body.append(badge);

    badge.querySelector<HTMLElement>(".awesomeado-eta__label")?.click();
    const calendarHost = badge.querySelector<HTMLElement>(".awesomeado-eta__calendar");
    expect(calendarHost?.style.display).toBe("none");
    expect(calendarHost?.querySelector(".awesomeado-datepicker")).toBeTruthy();

    const calendarButton = badge.querySelector<HTMLButtonElement>(".awesomeado-eta__calendar-btn");
    expect(calendarButton?.style.cursor).toBe("pointer");
    calendarButton?.click();
    expect(calendarHost?.style.display).toBe("block");

    badge.remove();
  });

  it("saves the day clicked in the themed calendar", () => {
    const picks: Array<string | null> = [];
    const badge = renderEtaBadge(document, {
      eta: "2026-08-10T00:00:00-07:00",
      now,
      onChange: (eta) => picks.push(eta),
    });
    document.body.append(badge);

    badge.querySelector<HTMLElement>(".awesomeado-eta__label")?.click();
    badge.querySelector<HTMLButtonElement>(".awesomeado-eta__calendar-btn")?.click();
    badge.querySelector<HTMLButtonElement>('[data-day="2026-08-21"]')?.click();

    expect(picks).toEqual(["2026-08-21T12:00:00Z"]);
    // Picking dismisses the popup.
    expect(badge.querySelector(".awesomeado-eta__popup")).toBeNull();

    badge.remove();
  });

  it("shows a Clear button that calls onChange(null) when an ETA is set", () => {
    const picks: Array<string | null> = [];
    const badge = renderEtaBadge(document, {
      eta: "2026-08-10T00:00:00-07:00",
      now,
      onChange: (eta) => picks.push(eta),
    });
    document.body.append(badge);

    const label = badge.querySelector<HTMLElement>(".awesomeado-eta__label");
    label?.click();

    const clear = badge.querySelector<HTMLButtonElement>(".awesomeado-eta__clear");
    expect(clear).toBeTruthy();
    clear!.click();

    expect(picks).toEqual([null]);

    badge.remove();
  });

  it("still offers Clear with no ETA set, and dismisses without a pointless write", () => {
    const picks: Array<string | null> = [];
    const badge = renderEtaBadge(document, {
      eta: null,
      now,
      onChange: (eta) => picks.push(eta),
    });
    document.body.append(badge);

    badge.querySelector<HTMLElement>(".awesomeado-eta__label")?.click();
    const clear = badge.querySelector<HTMLButtonElement>(".awesomeado-eta__clear");
    expect(clear).toBeTruthy();
    clear!.click();

    expect(picks).toEqual([]);
    expect(badge.querySelector(".awesomeado-eta__popup")).toBeNull();

    badge.remove();
  });
});

describe("renderEtaBadge - reflecting a write's outcome", () => {
  it("reflects a committed change through setEta", () => {
    const badge = renderEtaBadge(document, { eta: null, now, onChange: () => {} });
    expect(badge.textContent).toBe("No ETA");

    badge.setEta("2026-08-10T00:00:00-07:00");
    expect(badge.textContent).toContain("ETA 08/10/2026");

    badge.setEta(null);
    expect(badge.textContent).toBe("No ETA");
  });

  it("flags a failed write and clears the flag on the next committed value", () => {
    const badge = renderEtaBadge(document, {
      eta: "2026-08-10T00:00:00-07:00",
      now,
      onChange: () => {},
    });

    badge.setWriteError("Could not save this ETA.");
    expect(badge.textContent).toContain("\u26A0");
    expect(badge.title).toBe("Could not save this ETA.");
    // The stored value stays on screen; only the marker says the pick did not stick.
    expect(badge.textContent).toContain("ETA 08/10/2026");

    badge.setEta("2026-08-12T00:00:00-07:00");
    expect(badge.textContent).not.toContain("\u26A0");
    expect(badge.title).toContain("in ");
  });
});
