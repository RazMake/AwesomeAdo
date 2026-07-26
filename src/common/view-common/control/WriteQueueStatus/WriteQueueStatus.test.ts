import { afterEach, describe, expect, it } from "vitest";

import { renderWriteQueueStatus } from "./WriteQueueStatus";

// Clean up any DOM created by tests (top-level hook applies to every describe below).
afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderWriteQueueStatus - idle and count rendering", () => {
  it("is idle (hidden, empty text) by default with the correct role and aria-live", () => {
    const handle = renderWriteQueueStatus(document);

    expect(handle.element.className).toBe("awesomeado-write-queue-status");
    expect(handle.element.getAttribute("role")).toBe("status");
    expect(handle.element.getAttribute("aria-live")).toBe("polite");
    expect(handle.element.style.display).toBe("none");

    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");
    expect(label?.textContent).toBe("");
  });

  it("is idle when count is 0", () => {
    const handle = renderWriteQueueStatus(document, { count: 0 });

    expect(handle.element.style.display).toBe("none");
    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");
    expect(label?.textContent).toBe("");
  });

  it("shows the singular 'Saving 1 change' state when count is 1", () => {
    const handle = renderWriteQueueStatus(document, { count: 1 });

    expect(handle.element.style.display).not.toBe("none");
    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");
    expect(label?.textContent).toBe("Saving 1 change…");
    // Ensure singular: no trailing "s" on change.
    expect(label?.textContent).not.toContain("changes");
  });

  it("shows the plural 'Saving 3 changes' state when count is 3", () => {
    const handle = renderWriteQueueStatus(document, { count: 3 });

    expect(handle.element.style.display).not.toBe("none");
    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");
    expect(label?.textContent).toBe("Saving 3 changes…");
  });

  it("contains an SVG spinner with an animateTransform child regardless of count", () => {
    const idle = renderWriteQueueStatus(document, { count: 0 });
    const busy = renderWriteQueueStatus(document, { count: 2 });

    for (const handle of [idle, busy]) {
      const svg = handle.element.querySelector("svg");
      expect(svg).not.toBeNull();
      const animate = svg?.querySelector("animateTransform");
      expect(animate).not.toBeNull();
    }
  });
});

describe("renderWriteQueueStatus - setCount transitions and edge cases", () => {
  it("setCount(2) from idle shows the plural state; setCount(0) hides and clears again", () => {
    const handle = renderWriteQueueStatus(document);
    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");

    handle.setCount(2);
    expect(handle.element.style.display).not.toBe("none");
    expect(label?.textContent).toBe("Saving 2 changes…");

    handle.setCount(0);
    expect(handle.element.style.display).toBe("none");
    expect(label?.textContent).toBe("");
  });

  it("is idempotent when setCount is called repeatedly with the same value", () => {
    const handle = renderWriteQueueStatus(document, { count: 1 });
    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");

    handle.setCount(1);
    handle.setCount(1);

    expect(handle.element.style.display).not.toBe("none");
    expect(label?.textContent).toBe("Saving 1 change…");
  });

  it("treats negative counts as idle", () => {
    const handle = renderWriteQueueStatus(document, { count: -5 });

    expect(handle.element.style.display).toBe("none");
    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");
    expect(label?.textContent).toBe("");
  });

  it("treats non-finite counts as idle", () => {
    const handle = renderWriteQueueStatus(document, { count: Number.NaN });
    expect(handle.element.style.display).toBe("none");

    handle.setCount(Number.POSITIVE_INFINITY);
    expect(handle.element.style.display).toBe("none");
    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");
    expect(label?.textContent).toBe("");
  });

  it("renders text via textContent so a count produces exactly the expected string", () => {
    const handle = renderWriteQueueStatus(document, { count: 5 });
    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");

    // Counts are numbers, so there is no raw-HTML path; assert the exact rendered string.
    expect(label?.textContent).toBe("Saving 5 changes…");
    expect(label?.innerHTML).toBe("Saving 5 changes…");
  });
});

describe("renderWriteQueueStatus - failed writes", () => {
  it("reports a single failed write in the singular", () => {
    const handle = renderWriteQueueStatus(document);
    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");

    handle.setFailedCount(1);

    expect(handle.element.style.display).not.toBe("none");
    expect(label?.textContent).toBe("Couldn't save 1 change");
  });

  it("reports several failed writes in the plural and hides the spinner", () => {
    const handle = renderWriteQueueStatus(document);
    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");

    handle.setFailedCount(3);

    expect(label?.textContent).toBe("Couldn't save 3 changes");
    // The spinner would imply the write is still on its way, which is exactly what it is not.
    expect(handle.element.querySelector("svg")?.style.display).toBe("none");
  });

  it("keeps reporting the failure while a later write is still in flight", () => {
    const handle = renderWriteQueueStatus(document);
    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");

    handle.setFailedCount(1);
    handle.setCount(2);

    // A lost edit is the more urgent thing to report, so it wins over "saving".
    expect(label?.textContent).toBe("Couldn't save 1 change");
  });

  it("returns to the saving state when the failure count is cleared", () => {
    const handle = renderWriteQueueStatus(document);
    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");

    handle.setCount(1);
    handle.setFailedCount(1);
    handle.setFailedCount(0);

    expect(label?.textContent).toBe("Saving 1 change…");
    expect(handle.element.querySelector("svg")?.style.display).toBe("block");
  });

  it("treats negative and non-finite failure counts as no failure", () => {
    const handle = renderWriteQueueStatus(document);
    const label = handle.element.querySelector(".awesomeado-write-queue-status__label");

    handle.setFailedCount(-2);
    expect(handle.element.style.display).toBe("none");

    handle.setFailedCount(Number.NaN);
    expect(handle.element.style.display).toBe("none");
    expect(label?.textContent).toBe("");
  });
});
