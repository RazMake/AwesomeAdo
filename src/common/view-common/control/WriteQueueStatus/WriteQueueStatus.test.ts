import { afterEach, describe, expect, it } from "vitest";

import { renderWriteQueueStatus } from "./WriteQueueStatus";

// Clean up any DOM created by tests (top-level hook applies to every describe below).
afterEach(() => {
  document.body.innerHTML = "";
});

/**
 * The control renders two icon canvases. They are told apart by the SMIL element each one carries
 * (the spinner rotates via `animateTransform`; the warning triangle pulses via `animate`) rather
 * than by position, so the tests keep asserting on the right icon if the markup order ever changes.
 */
function iconsOf(root: HTMLElement): {
  spinner: SVGSVGElement | undefined;
  warning: SVGSVGElement | undefined;
} {
  const canvases = Array.from(root.querySelectorAll("svg"));
  return {
    spinner: canvases.find((svg) => svg.querySelector("animateTransform") !== null),
    warning: canvases.find((svg) => svg.querySelector("animate") !== null),
  };
}

/** The warning triangle's attention pulse, which the failed state replays. */
function pulseOf(root: HTMLElement): SVGAnimateElement | null {
  return iconsOf(root).warning?.querySelector("animate") ?? null;
}

/**
 * Stands in for the SMIL `beginElement` jsdom does not implement and counts how often the control
 * replays the pulse. Throws rather than returning a dead counter if the pulse is missing, so a
 * control that stopped rendering one can never be mistaken for one that simply never replays.
 */
function trackPulseReplays(root: HTMLElement): () => number {
  const pulse = pulseOf(root);
  if (pulse === null) {
    throw new Error("the warning icon must carry an animate element to replay");
  }
  let replays = 0;
  Object.assign(pulse, {
    beginElement: () => {
      replays += 1;
    },
  });
  return () => replays;
}

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

describe("renderWriteQueueStatus - the failed alert chip's paint", () => {
  it("fills the chip with the themed error color and its literal fallback", () => {
    const handle = renderWriteQueueStatus(document);

    handle.setFailedCount(1);

    // A lost edit is invisible on a persist-then-reflect board, so the chip has to be a solid fill
    // that survives being glanced past — and it must land on themes ADO defines no token for.
    expect(handle.element.style.background).toContain("--palette-error-background");
    expect(handle.element.style.background).toContain("#c50f1f");
  });

  it("writes the chip's text in the on-communication foreground so it reads on that fill", () => {
    const handle = renderWriteQueueStatus(document);

    handle.setFailedCount(1);

    expect(handle.element.style.color).toContain("--text-on-communication-background");
  });

  it("renders the failed chip bolder and larger than the quiet saving row", () => {
    const handle = renderWriteQueueStatus(document, { count: 2 });

    // The busy row is deliberately quiet: normal weight at the shared 11px.
    expect(handle.element.style.fontSize).toBe("11px");
    expect(handle.element.style.fontWeight).not.toBe("600");

    handle.setFailedCount(1);

    expect(handle.element.style.fontSize).toBe("12px");
    expect(handle.element.style.fontWeight).toBe("600");
  });

  it("returns to the quiet saving paint once the failure is cleared", () => {
    const handle = renderWriteQueueStatus(document, { count: 2 });

    handle.setFailedCount(1);
    handle.setFailedCount(0);

    expect(handle.element.style.fontSize).toBe("11px");
    expect(handle.element.style.fontWeight).not.toBe("600");
    expect(handle.element.style.background).not.toContain("--palette-error-background");
  });
});

describe("renderWriteQueueStatus - the failed state's announcement", () => {
  it("announces assertively as an alert while a write has been lost", () => {
    const handle = renderWriteQueueStatus(document, { count: 1 });

    handle.setFailedCount(1);

    // "polite" waits for a pause, which on a board the user is actively editing may never come.
    expect(handle.element.getAttribute("role")).toBe("alert");
    expect(handle.element.getAttribute("aria-live")).toBe("assertive");
  });

  it("reverts to a polite status when it returns to the saving state", () => {
    const handle = renderWriteQueueStatus(document, { count: 1 });

    handle.setFailedCount(1);
    handle.setFailedCount(0);

    expect(handle.element.getAttribute("role")).toBe("status");
    expect(handle.element.getAttribute("aria-live")).toBe("polite");
  });

  it("reverts to a polite status when it returns to idle", () => {
    const handle = renderWriteQueueStatus(document);

    handle.setFailedCount(1);
    handle.setFailedCount(0);

    expect(handle.element.style.display).toBe("none");
    expect(handle.element.getAttribute("role")).toBe("status");
    expect(handle.element.getAttribute("aria-live")).toBe("polite");
  });
});

describe("renderWriteQueueStatus - the warning triangle", () => {
  it("renders a warning triangle that stays hidden until a write is lost", () => {
    const handle = renderWriteQueueStatus(document);
    const { warning } = iconsOf(handle.element);

    expect(warning).toBeDefined();
    expect(warning?.style.display).toBe("none");

    handle.setFailedCount(1);

    expect(warning?.style.display).toBe("block");
  });

  it("never shows the spinner and the warning at the same time", () => {
    const handle = renderWriteQueueStatus(document, { count: 2 });
    const { spinner, warning } = iconsOf(handle.element);
    expect(spinner).toBeDefined();
    expect(warning).toBeDefined();
    const displays = (): string[] => [spinner, warning].map((icon) => icon?.style.display ?? "");

    // Busy, failed, and back to busy: exactly one icon is on screen in every state, and a visible
    // spinner beside a warning would say the lost write is still on its way.
    expect(displays()).toEqual(["block", "none"]);

    handle.setFailedCount(1);
    expect(displays()).toEqual(["none", "block"]);

    handle.setFailedCount(0);
    expect(displays()).toEqual(["block", "none"]);
  });

  it("pulses a finite number of times rather than blinking for the rest of the session", () => {
    const handle = renderWriteQueueStatus(document);

    const repeatCount = pulseOf(handle.element)?.getAttribute("repeatCount");

    expect(repeatCount).not.toBe("indefinite");
    expect(Number.isInteger(Number(repeatCount))).toBe(true);
    expect(Number(repeatCount)).toBeGreaterThan(0);
  });
});

describe("renderWriteQueueStatus - replaying the attention pulse", () => {
  it("does not throw where the DOM has no SMIL beginElement, as in jsdom", () => {
    const handle = renderWriteQueueStatus(document);

    // Guard the premise: if jsdom ever implements SMIL this test stops proving anything.
    expect(pulseOf(handle.element)?.beginElement).toBeUndefined();
    expect(() => handle.setFailedCount(1, "order HTTP 409")).not.toThrow();
    expect(handle.element.querySelector(".awesomeado-write-queue-status__label")?.textContent).toBe(
      "Couldn't save 1 change",
    );
  });

  it("replays the pulse only when the failure count grows", () => {
    const handle = renderWriteQueueStatus(document);
    const replays = trackPulseReplays(handle.element);

    handle.setFailedCount(1);
    expect(replays()).toBe(1);

    // A second lost edit must be as noticeable as the first, since only the number changes.
    handle.setFailedCount(2);
    expect(replays()).toBe(2);

    // An unchanged count is a re-render, not news.
    handle.setFailedCount(2);
    expect(replays()).toBe(2);

    // A shrinking count means failures were cleared, which is not something to shout about.
    handle.setFailedCount(1);
    expect(replays()).toBe(2);
  });

  it("does not replay the pulse for a non-finite count", () => {
    const handle = renderWriteQueueStatus(document);
    const replays = trackPulseReplays(handle.element);

    handle.setFailedCount(Number.NaN);

    expect(replays()).toBe(0);
  });
});

describe("renderWriteQueueStatus - the failure tooltip", () => {
  it("puts the reason and the Diagnostics log in the tooltip", () => {
    const handle = renderWriteQueueStatus(document);

    handle.setFailedCount(1, "order HTTP 409");

    // The chip has room for a count, not a cause, so the reason has to live in the tooltip.
    expect(handle.element.title).toBe(
      "Couldn't save: order HTTP 409. See the AwesomeADO Diagnostics log for details. Click to dismiss.",
    );
  });

  it("still points at the Diagnostics log when no reason was supplied", () => {
    const handle = renderWriteQueueStatus(document);

    handle.setFailedCount(2);

    expect(handle.element.title).toBe(
      "See the AwesomeADO Diagnostics log for details. Click to dismiss.",
    );
  });

  it("treats a blank reason as no reason at all", () => {
    const handle = renderWriteQueueStatus(document);

    handle.setFailedCount(1, "");

    expect(handle.element.title).toBe(
      "See the AwesomeADO Diagnostics log for details. Click to dismiss.",
    );
  });

  it("replaces the tooltip when a later failure reports a different reason", () => {
    const handle = renderWriteQueueStatus(document);

    handle.setFailedCount(1, "order HTTP 409");
    handle.setFailedCount(2, "rule violation");

    expect(handle.element.title).toContain("rule violation");
    expect(handle.element.title).not.toContain("order HTTP 409");
  });

  it("removes the tooltip entirely once the failure is cleared", () => {
    const handle = renderWriteQueueStatus(document);

    handle.setFailedCount(1, "order HTTP 409");
    expect(handle.element.hasAttribute("title")).toBe(true);

    handle.setFailedCount(0);

    expect(handle.element.hasAttribute("title")).toBe(false);
  });
});

/** The chip's rendered text, which every hidden state leaves empty. */
function labelOf(root: HTMLElement): string {
  return root.querySelector(".awesomeado-write-queue-status__label")?.textContent ?? "";
}

/**
 * Press `key` on the chip and report whether the control cancelled the event. The event is
 * `cancelable` so `defaultPrevented` actually records a `preventDefault()` call — on a
 * non-cancelable event the call is silently ignored and the flag would always read false.
 */
function pressChipKey(root: HTMLElement, key: string): boolean {
  const event = new KeyboardEvent("keydown", { key, cancelable: true });
  root.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("renderWriteQueueStatus - dismissing the failed chip", () => {
  it("hides the indicator and clears its text when the chip is clicked", () => {
    const handle = renderWriteQueueStatus(document);
    handle.setFailedCount(1, "order HTTP 409");

    handle.element.click();

    // Dismissing acknowledges the report, so the chip must leave nothing behind in the corner.
    expect(handle.element.style.display).toBe("none");
    expect(labelOf(handle.element)).toBe("");
  });

  it("hands the dismissed chip back as a polite status with no tooltip or focus stop", () => {
    const handle = renderWriteQueueStatus(document);
    handle.setFailedCount(1, "order HTTP 409");

    handle.element.click();

    expect(handle.element.getAttribute("role")).toBe("status");
    expect(handle.element.getAttribute("aria-live")).toBe("polite");
    expect(handle.element.hasAttribute("title")).toBe(false);
    expect(handle.element.hasAttribute("tabindex")).toBe(false);
  });

  it("ignores a click while idle, so nothing can be dismissed before it has failed", () => {
    const handle = renderWriteQueueStatus(document);

    handle.element.click();
    handle.setFailedCount(1);

    expect(handle.element.style.display).not.toBe("none");
    expect(labelOf(handle.element)).toBe("Couldn't save 1 change");
  });

  it("ignores a click while merely saving, leaving the saving row on screen", () => {
    const handle = renderWriteQueueStatus(document, { count: 2 });

    handle.element.click();

    expect(handle.element.style.display).not.toBe("none");
    expect(labelOf(handle.element)).toBe("Saving 2 changes…");

    // The stray click must not have latched a dismissal that swallows the next real failure.
    handle.setFailedCount(1);
    expect(labelOf(handle.element)).toBe("Couldn't save 1 change");
  });
});

describe("renderWriteQueueStatus - what a dismissal survives", () => {
  it("stays dismissed when the owner re-reports the same failure count", () => {
    const handle = renderWriteQueueStatus(document);
    handle.setFailedCount(2);
    handle.element.click();

    handle.setFailedCount(2);

    // The user already acknowledged these two; re-reporting the same total is not news.
    expect(handle.element.style.display).toBe("none");
    expect(labelOf(handle.element)).toBe("");
  });

  it("comes back with the new total when another write fails", () => {
    const handle = renderWriteQueueStatus(document);
    handle.setFailedCount(1);
    handle.element.click();

    handle.setFailedCount(2, "rule violation");

    // A dismissal that outlived its own failure would hide the only evidence the next edit was lost.
    expect(handle.element.style.display).not.toBe("none");
    expect(labelOf(handle.element)).toBe("Couldn't save 2 changes");
    expect(handle.element.title).toContain("rule violation");
  });

  it("clears the dismissal when the count is reset, so a later first failure shows again", () => {
    const handle = renderWriteQueueStatus(document);
    handle.setFailedCount(1);
    handle.element.click();

    handle.setFailedCount(0);
    handle.setFailedCount(1);

    expect(handle.element.style.display).not.toBe("none");
    expect(labelOf(handle.element)).toBe("Couldn't save 1 change");
  });

  it("reports the owner's count after a dismissal rather than a tally of its own", () => {
    const handle = renderWriteQueueStatus(document);
    handle.setFailedCount(3);
    handle.element.click();

    // The queue still holds all three, so the fourth loss reads as four — dismissing acknowledged
    // the report, it did not reset the owner's count or restart the control's own.
    handle.setFailedCount(4);

    expect(labelOf(handle.element)).toBe("Couldn't save 4 changes");
  });
});

describe("renderWriteQueueStatus - dismissing the failed chip from the keyboard", () => {
  it("dismisses on Enter", () => {
    const handle = renderWriteQueueStatus(document);
    handle.setFailedCount(1);

    pressChipKey(handle.element, "Enter");

    expect(handle.element.style.display).toBe("none");
    expect(labelOf(handle.element)).toBe("");
  });

  it("dismisses on Space and swallows the key so the page cannot scroll", () => {
    const handle = renderWriteQueueStatus(document);
    handle.setFailedCount(1);

    const prevented = pressChipKey(handle.element, " ");

    // An un-prevented Space scrolls the board out from under the user as they dismiss the chip.
    expect(prevented).toBe(true);
    expect(handle.element.style.display).toBe("none");
    expect(labelOf(handle.element)).toBe("");
  });

  it("leaves the chip alone for any other key", () => {
    const handle = renderWriteQueueStatus(document);
    handle.setFailedCount(1);

    const prevented = pressChipKey(handle.element, "a");

    expect(prevented).toBe(false);
    expect(handle.element.style.display).not.toBe("none");
    expect(labelOf(handle.element)).toBe("Couldn't save 1 change");
  });
});

describe("renderWriteQueueStatus - opening the log from the failed chip", () => {
  it("hands the user off to the log when the chip is clicked", () => {
    let opened = 0;
    const handle = renderWriteQueueStatus(document, { onOpenLog: () => (opened += 1) });
    handle.setFailedCount(1, "order HTTP 409");

    handle.element.click();

    // The chip reports a count; the cause only exists in the log, so activating it must go there.
    expect(opened).toBe(1);
  });

  it("hands the user off to the log from the keyboard too", () => {
    let opened = 0;
    const handle = renderWriteQueueStatus(document, { onOpenLog: () => (opened += 1) });
    handle.setFailedCount(1);

    pressChipKey(handle.element, "Enter");
    handle.setFailedCount(2);
    pressChipKey(handle.element, " ");

    expect(opened).toBe(2);
  });

  it("promises the log in the tooltip only when it can actually open one", () => {
    const linked = renderWriteQueueStatus(document, { onOpenLog: () => {} });
    const unlinked = renderWriteQueueStatus(document);

    linked.setFailedCount(1);
    unlinked.setFailedCount(1);

    // A chip that says "click for details" while nothing is wired up would be lying about itself.
    expect(linked.element.title).toBe(
      "Click to see the details in the AwesomeADO Diagnostics log.",
    );
    expect(unlinked.element.title).toBe(
      "See the AwesomeADO Diagnostics log for details. Click to dismiss.",
    );
  });

  it("still dismisses the chip it opened the log for", () => {
    const handle = renderWriteQueueStatus(document, { onOpenLog: () => {} });
    handle.setFailedCount(1);

    handle.element.click();

    // Reading the failure in the log IS the acknowledgement, so the corner goes quiet again.
    expect(handle.element.style.display).toBe("none");
    expect(labelOf(handle.element)).toBe("");
  });

  it("does not open the log for a click on a chip that is not reporting a failure", () => {
    let opened = 0;
    const handle = renderWriteQueueStatus(document, { count: 2, onOpenLog: () => (opened += 1) });

    // Saving, then dismissed: neither is a failure the user asked for details about, so a stray
    // click on the corner must not steal focus with a new log tab.
    handle.element.click();
    handle.setFailedCount(1);
    handle.element.click();
    handle.element.click();

    expect(opened).toBe(1);
  });
});

describe("renderWriteQueueStatus - the dismiss affordance", () => {
  it("becomes clickable and focusable only once a write has been lost", () => {
    const handle = renderWriteQueueStatus(document, { count: 2 });

    // A quiet saving row is a readout, not a control: it must not take a tab stop or look clickable.
    expect(handle.element.hasAttribute("tabindex")).toBe(false);
    expect(handle.element.style.cursor).not.toBe("pointer");

    handle.setFailedCount(1);

    expect(handle.element.getAttribute("tabindex")).toBe("0");
    expect(handle.element.style.cursor).toBe("pointer");
  });

  it("gives up the tab stop once the failure is cleared", () => {
    const handle = renderWriteQueueStatus(document, { count: 2 });

    handle.setFailedCount(1);
    handle.setFailedCount(0);

    expect(handle.element.hasAttribute("tabindex")).toBe(false);
    expect(handle.element.style.cursor).not.toBe("pointer");
  });

  it("gives up the tab stop as soon as it is dismissed", () => {
    const handle = renderWriteQueueStatus(document, { count: 2 });
    handle.setFailedCount(1);

    handle.element.click();

    // Nothing is left to dismiss, so a tab stop on an invisible row would be a dead focus trap.
    expect(handle.element.hasAttribute("tabindex")).toBe(false);
  });
});
