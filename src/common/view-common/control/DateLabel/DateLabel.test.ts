import { describe, expect, it } from "vitest";

import { renderDateLabel } from "./DateLabel";

describe("renderDateLabel", () => {
  it("renders the formatted PST date text", () => {
    const label = renderDateLabel(document, "2026-07-24T15:30:00Z");

    expect(label.textContent).toBe("07/24/2026");
    expect(label.className).toBe("awesomeado-date");
  });

  it("sets a tooltip with the PST time only", () => {
    const label = renderDateLabel(document, "2026-07-24T15:30:00Z");

    // The tooltip carries the "@ h:mm AM/PM PST" time and omits the date.
    expect(label.title).toBe("@ 8:30 AM PST");
  });

  it("renders a dash for empty ISO strings and no tooltip", () => {
    const label = renderDateLabel(document, "");

    expect(label.textContent).toBe("—");
    expect(label.title).toBe("");
  });

  it("renders a dash for invalid ISO strings and no tooltip", () => {
    const label = renderDateLabel(document, "not-a-date");

    expect(label.textContent).toBe("—");
    expect(label.title).toBe("");
  });

  it("uses text content only so a crafted ISO cannot inject HTML", () => {
    const label = renderDateLabel(document, "<img src=x onerror=alert(1)>");

    // No child nodes created from the string — textContent keeps it inert.
    expect(label.querySelector("img")).toBeNull();
    expect(label.children.length).toBe(0);
  });

  it("inherits theme text color and font", () => {
    const label = renderDateLabel(document, "2026-07-24T15:30:00Z");

    // Theme-aware: color and font inherit from ADO's theme.
    expect(label.style.color).toBe("inherit");
    expect(label.style.font).toBe("inherit");
  });
});
