import { afterEach, describe, expect, it } from "vitest";

import { renderStatusBadge } from "./StatusBadge";

// Clean up any DOM created by tests (top-level hook applies to every describe below).
afterEach(() => {
  document.body.innerHTML = "";
});

/** Read the badge chip element from a rendered badge. */
const chipOf = (badge: HTMLElement): HTMLElement =>
  badge.querySelector<HTMLElement>(".awesomeado-status__badge")!;

/** Whitespace-insensitive contains, so `rgb(30, 140, 45)` matches `rgb(30,140,45)`. */
const containsColor = (cssValue: string, needle: string): boolean =>
  cssValue.replace(/\s/g, "").includes(needle.replace(/\s/g, ""));

describe("renderStatusBadge - colors and text", () => {
  it("renders the state text", () => {
    const badge = renderStatusBadge(document, { state: "In Progress" });

    expect(chipOf(badge).textContent).toContain("In Progress");
  });

  it("uses a neutral themed background when no ordinal is provided", () => {
    const badge = renderStatusBadge(document, { state: "In Progress" });

    expect(chipOf(badge).style.background).toContain("var(--palette-neutral-4");
  });

  it("uses a neutral themed background when the ordinal is negative (maps to no column)", () => {
    const badge = renderStatusBadge(document, { state: "Custom", ordinal: -1 });

    expect(chipOf(badge).style.background).toContain("var(--palette-neutral-4");
  });

  it("colors the 1st position (ordinal 0) gray", () => {
    const badge = renderStatusBadge(document, { state: "Queue", ordinal: 0 });

    expect(containsColor(chipOf(badge).style.background, "rgba(128,128,128,0.2)")).toBe(true);
  });

  it("colors the 2nd position (ordinal 1) blue", () => {
    const badge = renderStatusBadge(document, { state: "Active", ordinal: 1 });

    expect(containsColor(chipOf(badge).style.background, "rgba(0,120,212,0.2)")).toBe(true);
  });

  it("colors the 3rd position (ordinal 2) yellow", () => {
    const badge = renderStatusBadge(document, { state: "Waiting", ordinal: 2 });

    expect(containsColor(chipOf(badge).style.background, "rgba(224,168,0,0.2)")).toBe(true);
  });

  it("colors the 4th position (ordinal 3) green with a contrasting green text", () => {
    const badge = renderStatusBadge(document, { state: "Done", ordinal: 3 });

    const chip = chipOf(badge);
    expect(containsColor(chip.style.background, "rgba(16,124,16,0.2)")).toBe(true);
    expect(containsColor(chip.style.color, "rgb(30,140,45)")).toBe(true);
  });

  it("colors the 5th position (ordinal 4) red with a contrasting red text", () => {
    const badge = renderStatusBadge(document, { state: "Removed", ordinal: 4 });

    const chip = chipOf(badge);
    expect(containsColor(chip.style.background, "rgba(197,15,31,0.2)")).toBe(true);
    expect(containsColor(chip.style.color, "rgb(224,60,60)")).toBe(true);
  });

  it("colors a position identically regardless of the state label (consistent across types)", () => {
    const bug = renderStatusBadge(document, { state: "Closed", ordinal: 3 });
    const story = renderStatusBadge(document, { state: "Completed", ordinal: 3 });

    expect(chipOf(bug).style.background).toBe(chipOf(story).style.background);
  });

  it("uses the theme's primary text for the first three positions", () => {
    for (const ordinal of [0, 1, 2]) {
      const badge = renderStatusBadge(document, { state: "S", ordinal });
      expect(chipOf(badge).style.color).toContain("var(--text-primary-color");
    }
  });

  it("clamps positions beyond the fifth to the terminal (red) color", () => {
    const badge = renderStatusBadge(document, { state: "Extra", ordinal: 7 });

    expect(containsColor(chipOf(badge).style.background, "rgba(197,15,31,0.2)")).toBe(true);
  });
});

describe("renderStatusBadge - editability and caret", () => {
  it("read-only mode has cursor:default and no caret", () => {
    const badge = renderStatusBadge(document, {
      state: "Resolved",
      ordinal: 3,
      editable: false,
      columns: [{ column: "Resolved", primaryState: "Resolved", ordinal: 3 }],
    });

    const chip = badge.querySelector<HTMLElement>(".awesomeado-status__badge");
    expect(chip?.style.cursor).toBe("default");
    // No caret glyph (▾) should be present.
    expect(chip?.textContent).not.toContain("▾");
  });

  it("read-only mode (no columns) has cursor:default and does not open popup on click", () => {
    const badge = renderStatusBadge(document, {
      state: "New",
      editable: true,
      columns: [], // Empty columns → effectively read-only.
    });
    document.body.append(badge);

    const chip = badge.querySelector<HTMLElement>(".awesomeado-status__badge");
    expect(chip?.style.cursor).toBe("default");

    chip?.click();
    expect(badge.querySelector(".awesomeado-status__popup")).toBeNull();
  });

  it("editable mode has cursor:pointer and renders a caret", () => {
    const badge = renderStatusBadge(document, {
      state: "In Progress",
      ordinal: 1,
      editable: true,
      columns: [{ column: "In Progress", primaryState: "Active", ordinal: 1 }],
    });

    const chip = badge.querySelector<HTMLElement>(".awesomeado-status__badge");
    expect(chip?.style.cursor).toBe("pointer");
    expect(chip?.textContent).toContain("▾");
  });
});

describe("renderStatusBadge - opening the state popup", () => {
  it("clicking the badge opens a popup containing only alternative state badges", () => {
    const badge = renderStatusBadge(document, {
      state: "New",
      ordinal: 0,
      editable: true,
      columns: [
        { column: "New", primaryState: "New", ordinal: 0 },
        { column: "Active", primaryState: "Active", ordinal: 1 },
        { column: "Resolved", primaryState: "Resolved", ordinal: 3 },
      ],
    });
    document.body.append(badge);

    const chip = badge.querySelector<HTMLElement>(".awesomeado-status__badge");
    chip?.click();

    const popup = badge.querySelector(".awesomeado-status__popup");
    expect(popup).not.toBeNull();

    const rows = badge.querySelectorAll<HTMLButtonElement>(".awesomeado-status__row");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toBe("Active");
    expect(rows[1]?.textContent).toBe("Resolved");
    // Each row is colored by its own board-column ordinal, not the current state's.
    expect(containsColor(rows[0]?.style.background ?? "", "rgba(0,120,212,0.2)")).toBe(true);
    expect(containsColor(rows[1]?.style.background ?? "", "rgba(16,124,16,0.2)")).toBe(true);
  });

  it("selecting a row calls onChange with primaryState and column, then closes the popup", () => {
    let calledPrimaryState: string | null = null;
    let calledColumn: string | null = null;

    const badge = renderStatusBadge(document, {
      state: "New",
      ordinal: 0,
      editable: true,
      columns: [
        { column: "In Progress", primaryState: "Active", ordinal: 1 },
        { column: "Resolved", primaryState: "Resolved", ordinal: 3 },
      ],
      onChange: (primaryState, column) => {
        calledPrimaryState = primaryState;
        calledColumn = column;
      },
    });
    document.body.append(badge);

    const chip = badge.querySelector<HTMLElement>(".awesomeado-status__badge");
    chip?.click();

    const rows = badge.querySelectorAll<HTMLButtonElement>(".awesomeado-status__row");
    rows[0]?.click();

    expect(calledPrimaryState).toBe("Active");
    expect(calledColumn).toBe("In Progress");
    expect(badge.querySelector(".awesomeado-status__popup")).toBeNull();
  });
});

describe("renderStatusBadge - popup dismissal", () => {
  it("pressing Escape closes the popup", () => {
    const badge = renderStatusBadge(document, {
      state: "New",
      ordinal: 0,
      editable: true,
      columns: [{ column: "Active", primaryState: "Active", ordinal: 1 }],
    });
    document.body.append(badge);

    const chip = badge.querySelector<HTMLElement>(".awesomeado-status__badge");
    chip?.click();

    expect(badge.querySelector(".awesomeado-status__popup")).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(badge.querySelector(".awesomeado-status__popup")).toBeNull();
  });

  it("clicking outside the popup closes it", () => {
    const badge = renderStatusBadge(document, {
      state: "New",
      ordinal: 0,
      editable: true,
      columns: [{ column: "Active", primaryState: "Active", ordinal: 1 }],
    });
    document.body.append(badge);

    const chip = badge.querySelector<HTMLElement>(".awesomeado-status__badge");
    chip?.click();

    expect(badge.querySelector(".awesomeado-status__popup")).not.toBeNull();

    // Click outside (on the body, not the badge or popup).
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(badge.querySelector(".awesomeado-status__popup")).toBeNull();
  });

  it("clicking the badge again closes the popup", () => {
    const badge = renderStatusBadge(document, {
      state: "New",
      ordinal: 0,
      editable: true,
      columns: [{ column: "Active", primaryState: "Active", ordinal: 1 }],
    });
    document.body.append(badge);

    const chip = badge.querySelector<HTMLElement>(".awesomeado-status__badge");

    // Open.
    chip?.click();
    expect(badge.querySelector(".awesomeado-status__popup")).not.toBeNull();

    // Close.
    chip?.click();
    expect(badge.querySelector(".awesomeado-status__popup")).toBeNull();
  });
});

describe("renderStatusBadge - option list and safety", () => {
  it("excludes a column whose display label matches the current state", () => {
    const badge = renderStatusBadge(document, {
      state: "In Progress",
      ordinal: 1,
      editable: true,
      columns: [
        { column: "In Progress", primaryState: "Active", ordinal: 1 },
        { column: "New", primaryState: "New", ordinal: 0 },
        { column: "Resolved", primaryState: "Resolved", ordinal: 3 },
      ],
    });
    document.body.append(badge);

    const chip = badge.querySelector<HTMLElement>(".awesomeado-status__badge");
    chip?.click();

    const rows = badge.querySelectorAll<HTMLElement>(".awesomeado-status__row");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toBe("New");
    expect(rows[1]?.textContent).toBe("Resolved");
    expect(rows[0]?.style.fontWeight).not.toBe("bold");
    expect(rows[1]?.style.fontWeight).not.toBe("bold");
  });

  it("inserts column labels as text so HTML tags do not inject markup", () => {
    const badge = renderStatusBadge(document, {
      state: "New",
      ordinal: 0,
      editable: true,
      columns: [{ column: "<img src=x onerror=alert(1)>", primaryState: "Malicious", ordinal: 1 }],
    });
    document.body.append(badge);

    const chip = badge.querySelector<HTMLElement>(".awesomeado-status__badge");
    chip?.click();

    const row = badge.querySelector<HTMLButtonElement>(".awesomeado-status__row");
    // No <img> child should be created from the string.
    expect(row?.querySelector("img")).toBeNull();
    expect(row?.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("setStatus relabels the chip and re-tints it to the new ordinal", () => {
    // Regression: a committed move must update both the label and its color together, so the tint
    // never lags behind the shown state.
    const badge = renderStatusBadge(document, {
      state: "In Progress",
      ordinal: 1,
      editable: true,
      columns: [
        { column: "In Progress", primaryState: "Active", ordinal: 1 },
        { column: "Done", primaryState: "Closed", ordinal: 3 },
      ],
    });

    const chip = chipOf(badge);
    expect(containsColor(chip.style.background, "rgba(0,120,212,0.2)")).toBe(true);

    badge.setStatus("Done", 3);

    expect(chip.textContent).toContain("Done");
    // The caret is preserved after a relabel.
    expect(chip.textContent).toContain("▾");
    expect(containsColor(chip.style.background, "rgba(16,124,16,0.2)")).toBe(true);
  });
});

describe("renderStatusBadge - setStatus and sizing", () => {
  it("setStatus re-tints to neutral for an unmapped ordinal", () => {
    const badge = renderStatusBadge(document, { state: "Done", ordinal: 3 });

    badge.setStatus("Custom", undefined);

    const chip = chipOf(badge);
    expect(chip.textContent).toContain("Custom");
    expect(chip.style.background).toContain("var(--palette-neutral-4");
  });

  it("sizes every badge to the shared minWidthCh so a column reads as one uniform width", () => {
    // Two badges with different labels but the same shared width must render identically sized.
    const wide = renderStatusBadge(document, { state: "In Progress", minWidthCh: 12 });
    const narrow = renderStatusBadge(document, { state: "Done", minWidthCh: 12 });

    expect(chipOf(wide).style.width).toBe(chipOf(narrow).style.width);
  });

  it("never renders a badge narrower than its own longest label", () => {
    // A label longer than the shared width still fits: the badge widens to its own content.
    const badge = renderStatusBadge(document, { state: "A very long status label", minWidthCh: 2 });

    const width = Number.parseInt(chipOf(badge).style.width, 10);
    expect(width).toBeGreaterThanOrEqual("A very long status label".length);
  });

  it("refreshes the dropdown options after a committed move so the list tracks the new state", () => {
    // Regression: the option list is rebuilt on every open. Before the fix it closed over the
    // ORIGINAL state, so after moving to a new column the dropdown kept excluding the old column and
    // hid the one just left. It must instead exclude the CURRENT column and re-offer the previous one.
    const badge = renderStatusBadge(document, {
      state: "New",
      ordinal: 0,
      editable: true,
      columns: [
        { column: "New", primaryState: "New", ordinal: 0 },
        { column: "Active", primaryState: "Active", ordinal: 1 },
        { column: "Done", primaryState: "Closed", ordinal: 3 },
      ],
    });
    document.body.append(badge);

    const chip = chipOf(badge);

    // First open excludes the initial "New" column.
    chip.click();
    let labels = [...badge.querySelectorAll(".awesomeado-status__row")].map((r) => r.textContent);
    expect(labels).toEqual(["Active", "Done"]);
    chip.click(); // Close.

    // Commit a move to "Active" (as the owner does on a successful write).
    badge.setStatus("Active", 1);

    // Reopening must now exclude "Active" and once again offer "New".
    chip.click();
    labels = [...badge.querySelectorAll(".awesomeado-status__row")].map((r) => r.textContent);
    expect(labels).toEqual(["New", "Done"]);
  });
});
