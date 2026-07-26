import { beforeEach, describe, expect, it } from "vitest";

import { renderDatePicker } from "./DatePicker";

/** The rendered day cells, in grid order. */
function dayCells(calendar: HTMLElement): HTMLButtonElement[] {
  return [...calendar.querySelectorAll<HTMLButtonElement>(".awesomeado-datepicker__day")];
}

function monthLabelOf(calendar: HTMLElement): string {
  return calendar.querySelector(".awesomeado-datepicker__month")?.textContent ?? "";
}

describe("renderDatePicker - month rendering", () => {
  beforeEach(() => {
    document.getElementById("awesomeado-datepicker-style")?.remove();
  });

  it("opens on the selected day's month and marks it", () => {
    const calendar = renderDatePicker(document, {
      selected: "2026-08-15",
      today: "2026-07-25",
      onPick: () => {},
    });

    expect(monthLabelOf(calendar)).toBe("August 2026");
    const selected = calendar.querySelector<HTMLButtonElement>('[data-day="2026-08-15"]');
    expect(selected?.style.background).toBe("var(--communication-background, #0078d4)");
    expect(selected?.style.fontWeight).toBe("600");
  });

  it("falls back to today's month when nothing is selected", () => {
    const calendar = renderDatePicker(document, {
      selected: null,
      today: "2026-07-25",
      onPick: () => {},
    });

    expect(monthLabelOf(calendar)).toBe("July 2026");
    // July 2026 has 31 days, all rendered as clickable cells.
    expect(dayCells(calendar)).toHaveLength(31);
  });

  it("renders leap-day February and aligns the first day under its weekday", () => {
    const calendar = renderDatePicker(document, {
      selected: "2028-02-10",
      today: null,
      onPick: () => {},
    });

    expect(dayCells(calendar)).toHaveLength(29);
    // 2028-02-01 is a Tuesday, so two blank cells precede it in the grid.
    const grid = calendar.querySelector(".awesomeado-datepicker__grid");
    expect(grid?.children[2]).toBe(calendar.querySelector('[data-day="2028-02-01"]'));
  });

  it("injects its stylesheet once, however many calendars are rendered", () => {
    renderDatePicker(document, { selected: null, today: "2026-07-25", onPick: () => {} });
    renderDatePicker(document, { selected: null, today: "2026-07-25", onPick: () => {} });

    expect(document.querySelectorAll("#awesomeado-datepicker-style")).toHaveLength(1);
  });
});

describe("renderDatePicker - navigation and picking", () => {
  it("steps to the previous month, rolling the year back at January", () => {
    const calendar = renderDatePicker(document, {
      selected: "2026-01-10",
      today: null,
      onPick: () => {},
    });

    calendar.querySelector<HTMLButtonElement>(".awesomeado-datepicker__nav--previous")?.click();

    expect(monthLabelOf(calendar)).toBe("December 2025");
    expect(dayCells(calendar)).toHaveLength(31);
  });

  it("steps to the next month, rolling the year forward at December", () => {
    const calendar = renderDatePicker(document, {
      selected: "2026-12-10",
      today: null,
      onPick: () => {},
    });

    calendar.querySelector<HTMLButtonElement>(".awesomeado-datepicker__nav--next")?.click();

    expect(monthLabelOf(calendar)).toBe("January 2027");
    expect(calendar.querySelector('[data-day="2027-01-31"]')).toBeTruthy();
  });

  it("calls onPick with the clicked day, including one in a stepped-to month", () => {
    const picks: string[] = [];
    const calendar = renderDatePicker(document, {
      selected: "2026-07-01",
      today: null,
      onPick: (day) => picks.push(day),
    });

    calendar.querySelector<HTMLButtonElement>('[data-day="2026-07-22"]')?.click();
    calendar.querySelector<HTMLButtonElement>(".awesomeado-datepicker__nav--next")?.click();
    calendar.querySelector<HTMLButtonElement>('[data-day="2026-08-03"]')?.click();

    expect(picks).toEqual(["2026-07-22", "2026-08-03"]);
  });

  it("outlines today and leaves other days unfilled", () => {
    const calendar = renderDatePicker(document, {
      selected: null,
      today: "2026-07-25",
      onPick: () => {},
    });

    const today = calendar.querySelector<HTMLButtonElement>('[data-day="2026-07-25"]');
    const other = calendar.querySelector<HTMLButtonElement>('[data-day="2026-07-24"]');
    // The selected day is the only one that bolds; an ordinary day inherits the popup's weight.
    expect(other?.style.fontWeight).toBe("inherit");
    expect(today?.style.borderColor).toBe("rgba(128, 128, 128, 0.45)");
    expect(other?.style.borderColor).toBe("transparent");
    expect(today?.style.cursor).toBe("pointer");
  });
});
