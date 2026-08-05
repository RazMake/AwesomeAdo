import { afterEach, describe, expect, it, vi } from "vitest";

import { createPopupHost } from "./popupHost";

afterEach(() => {
  document.body.innerHTML = "";
});

/** Build a host over a fresh trigger + mount point appended to the document. */
const setup = (interactive = true) => {
  const trigger = document.createElement("button");
  const mountInto = document.createElement("div");
  mountInto.append(trigger);
  document.body.append(mountInto);
  const buildPopup = vi.fn((close: () => void) => {
    const el = document.createElement("div");
    el.className = "popup";
    const closer = document.createElement("button");
    closer.className = "closer";
    closer.addEventListener("click", () => close());
    el.append(closer);
    return el;
  });
  const host = createPopupHost({ doc: document, trigger, mountInto, buildPopup, interactive });
  return { trigger, mountInto, buildPopup, host };
};

describe("createPopupHost - open and toggle", () => {
  it("opens the popup when the trigger is clicked", () => {
    const { trigger, mountInto, host } = setup();

    trigger.click();

    expect(host.isOpen).toBe(true);
    expect(mountInto.querySelector(".popup")).not.toBeNull();
  });

  it("toggles the popup closed on a second trigger click", () => {
    const { trigger, mountInto, host } = setup();

    trigger.click();
    trigger.click();

    expect(host.isOpen).toBe(false);
    expect(mountInto.querySelector(".popup")).toBeNull();
  });

  it("rebuilds the popup on each open", () => {
    const { trigger, buildPopup } = setup();

    trigger.click();
    trigger.click();
    trigger.click();

    expect(buildPopup).toHaveBeenCalledTimes(2);
  });

  it("closes when an in-popup action calls the provided close", () => {
    const { trigger, mountInto, host } = setup();

    trigger.click();
    mountInto.querySelector<HTMLButtonElement>(".closer")!.click();

    expect(host.isOpen).toBe(false);
  });

  it("reports each open with the mounted popup, so it can be focused", () => {
    const trigger = document.createElement("button");
    const mountInto = document.createElement("div");
    mountInto.append(trigger);
    document.body.append(mountInto);
    const input = document.createElement("input");
    const onOpened = vi.fn((popup: HTMLElement) => {
      // Focus only takes when the popup is already in the document, which is exactly the guarantee
      // this hook exists to give.
      popup.querySelector("input")?.focus();
    });
    createPopupHost({
      doc: document,
      trigger,
      mountInto,
      buildPopup: () => {
        const el = document.createElement("div");
        el.append(input);
        return el;
      },
      onOpened,
    });

    trigger.click();

    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
  });

  it("reports each close regardless of how the popup is dismissed", () => {
    const trigger = document.createElement("button");
    const mountInto = document.createElement("div");
    mountInto.append(trigger);
    document.body.append(mountInto);
    const onClosed = vi.fn();
    createPopupHost({
      doc: document,
      trigger,
      mountInto,
      buildPopup: () => document.createElement("div"),
      onClosed,
    });

    trigger.click();
    trigger.click();
    trigger.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onClosed).toHaveBeenCalledTimes(2);
  });
});

describe("createPopupHost - dismissal and lifecycle", () => {
  it("closes on an outside pointerdown", () => {
    const outside = document.createElement("div");
    document.body.append(outside);
    const { trigger, host } = setup();

    trigger.click();
    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(host.isOpen).toBe(false);
  });

  it("stays open when a pointerdown lands inside the popup", () => {
    const { trigger, mountInto, host } = setup();

    trigger.click();
    mountInto.querySelector(".popup")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(host.isOpen).toBe(true);
  });

  it("closes on Escape", () => {
    const { trigger, host } = setup();

    trigger.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(host.isOpen).toBe(false);
  });

  it("stops listening for dismissal after close", () => {
    const outside = document.createElement("div");
    document.body.append(outside);
    const { trigger, host } = setup();

    trigger.click();
    host.close();
    // A stray Escape after close must not throw or reopen.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(host.isOpen).toBe(false);
  });

  it("does not wire the trigger click when not interactive", () => {
    const { trigger, host } = setup(false);

    trigger.click();

    expect(host.isOpen).toBe(false);
  });
});

/** A host whose popup holds a text field, opened, with Escape handling as the caller asked. */
const setupWithField = (dismissOnFieldEscape: boolean) => {
  const trigger = document.createElement("button");
  const mountInto = document.createElement("div");
  mountInto.append(trigger);
  document.body.append(mountInto);
  const field = document.createElement("textarea");
  const host = createPopupHost({
    doc: document,
    trigger,
    mountInto,
    dismissOnFieldEscape,
    buildPopup: () => {
      const popup = document.createElement("div");
      popup.append(field);
      return popup;
    },
  });
  trigger.click();
  return { host, field, mountInto };
};

/** Escape as it actually arrives: at the field, bubbling up to the host's document listener. */
const escapeFrom = (target: EventTarget): void => {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
};

describe("createPopupHost - Escape inside a text field", () => {
  it("dismisses the popup by default, which suits one that only offers values to pick", () => {
    const { host, field } = setupWithField(true);

    escapeFrom(field);

    expect(host.isOpen).toBe(false);
  });

  it("leaves the popup alone when the field is meant to answer that Escape", () => {
    const { host, field } = setupWithField(false);

    escapeFrom(field);

    expect(host.isOpen).toBe(true);
  });

  it("still closes on the NEXT Escape, once nothing inside is editing", () => {
    const { host, mountInto } = setupWithField(false);

    escapeFrom(mountInto);

    expect(host.isOpen).toBe(false);
  });

  it("only spares a field INSIDE the popup, not one that happens to be elsewhere", () => {
    const { host } = setupWithField(false);
    const outsideField = document.createElement("input");
    document.body.append(outsideField);

    escapeFrom(outsideField);

    expect(host.isOpen).toBe(false);
  });

  it("closes when Escape comes from a checkbox, which is not a text editor", () => {
    const { host, field } = setupWithField(false);
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    field.replaceWith(checkbox);

    escapeFrom(checkbox);

    expect(host.isOpen).toBe(false);
  });
});

describe("createPopupHost - keeping the popup on screen", () => {
  /** Open a host whose popup reports a fixed box, so the repositioning maths is deterministic. */
  const openWithBox = (
    box: { left: number; top: number; width: number; height: number },
    parent: HTMLElement = document.body,
  ) => {
    const trigger = document.createElement("button");
    const mountInto = document.createElement("div");
    mountInto.append(trigger);
    parent.append(mountInto);
    createPopupHost({
      doc: document,
      trigger,
      mountInto,
      buildPopup: () => {
        const element = document.createElement("div");
        element.className = "popup";
        element.getBoundingClientRect = () =>
          ({
            ...box,
            right: box.left + box.width,
            bottom: box.top + box.height,
          }) as DOMRect;
        return element;
      },
    });
    trigger.click();
    return mountInto.querySelector<HTMLElement>(".popup")!;
  };

  it("shifts a popup that spills past the right edge back into view", () => {
    const popup = openWithBox({ left: window.innerWidth - 100, top: 100, width: 200, height: 120 });

    // Spilled 100px past the edge plus the 8px margin.
    expect(popup.style.left).toBe("-108px");
  });

  it("leaves a popup that already fits horizontally alone", () => {
    const popup = openWithBox({ left: 10, top: 100, width: 200, height: 120 });

    expect(popup.style.left).toBe("");
  });

  it("never shifts a popup past the left edge to fix the right one", () => {
    // Wider than the window: any shift would only trade a hidden right side for a hidden left side.
    const popup = openWithBox({ left: 0, top: 100, width: window.innerWidth + 200, height: 120 });

    expect(popup.style.left).toBe("");
  });

  it("flips a popup above its trigger when it spills below and fits above", () => {
    const popup = openWithBox({ left: 10, top: window.innerHeight - 20, width: 200, height: 120 });

    expect(popup.style.top).toBe("auto");
    expect(popup.style.bottom).toBe("100%");
    expect(popup.style.marginBottom).toBe("4px");
  });

  it("slides a popup up when it fits neither below its trigger nor above it", () => {
    // A tall right-click menu opened from the middle of jsdom's 768px window: 400px tall with only
    // 380px above it, so it cannot flip, and without the slide its last commands hang off the edge.
    const popup = openWithBox({ left: 10, top: 380, width: 200, height: 400 });

    // Spilled 20px past the edge once the 8px margin is honoured, so it rises by exactly that.
    expect(popup.style.marginTop).toBe("-20px");
    expect(popup.style.bottom).toBe("");
  });

  it("never slides a popup past the top edge to fix the bottom one", () => {
    // Taller than the window: any further rise would only trade a hidden bottom for a hidden top.
    const popup = openWithBox({ left: 10, top: 40, width: 200, height: window.innerHeight });

    expect(popup.style.marginTop).toBe("-32px");
    expect(popup.style.bottom).toBe("");
  });

  it("leaves an unmeasurable popup untouched", () => {
    // jsdom reports a zero box for a plain element; without a measurement there is nothing to fix.
    const { trigger, mountInto } = setup();

    trigger.click();

    const popup = mountInto.querySelector<HTMLElement>(".popup")!;
    expect(popup.style.left).toBe("");
    expect(popup.style.bottom).toBe("");
  });

  it("clamps to a scrolling ancestor's client box, not the window", () => {
    // A scroll container's scrollbars shrink what is actually visible, so a popup can sit inside the
    // window (1024px wide here) yet still be hidden under the container's scrollbar. The overflow
    // longhands are set individually because jsdom's computed style does not expand the shorthand.
    const scroller = document.createElement("div");
    scroller.style.overflowX = "auto";
    scroller.style.overflowY = "auto";
    scroller.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    Object.defineProperty(scroller, "clientWidth", { value: 300 });
    Object.defineProperty(scroller, "clientHeight", { value: 300 });
    document.body.append(scroller);

    const popup = openWithBox({ left: 200, top: 10, width: 150, height: 100 }, scroller);

    // Spilled 50px past the container's 300px client edge plus the 8px margin.
    expect(popup.style.left).toBe("-58px");
  });
});

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const rectOf = (box: Box): DOMRect =>
  ({
    ...box,
    right: box.left + box.width,
    bottom: box.top + box.height,
  }) as DOMRect;

/**
 * Open a popup inside a scroll box of a given visible size, with both the trigger and the popup
 * reporting fixed boxes so the escape maths is deterministic (jsdom performs no layout).
 */
const openInScroller = (boxes: { scroller: Box; trigger: Box; popup: Box }) => {
  const scroller = document.createElement("div");
  // The overflow longhands are set individually because jsdom's computed style does not expand the
  // shorthand.
  scroller.style.overflowX = "auto";
  scroller.style.overflowY = "auto";
  scroller.getBoundingClientRect = () => rectOf(boxes.scroller);
  Object.defineProperty(scroller, "clientWidth", { value: boxes.scroller.width });
  Object.defineProperty(scroller, "clientHeight", { value: boxes.scroller.height });
  document.body.append(scroller);

  const trigger = document.createElement("button");
  trigger.getBoundingClientRect = () => rectOf(boxes.trigger);
  const mountInto = document.createElement("div");
  mountInto.append(trigger);
  scroller.append(mountInto);

  const host = createPopupHost({
    doc: document,
    trigger,
    mountInto,
    buildPopup: () => {
      const element = document.createElement("div");
      element.className = "popup";
      element.style.position = "absolute";
      element.getBoundingClientRect = () => rectOf(boxes.popup);
      return element;
    },
  });
  trigger.click();
  return { host, popup: mountInto.querySelector<HTMLElement>(".popup")! };
};

/** A one-row-tall scroll box (the rolled-up children popup) that can never show a picker. */
const tooShort = { left: 100, top: 200, width: 420, height: 34 };
const rowTrigger = { left: 300, top: 204, width: 60, height: 20 };
const pickerPopup = { left: 300, top: 228, width: 200, height: 34 };

describe("createPopupHost - escaping a scroll box too small to show the popup", () => {
  it("anchors the popup to the viewport under its trigger", () => {
    const { popup } = openInScroller({
      scroller: tooShort,
      trigger: rowTrigger,
      popup: pickerPopup,
    });

    expect(popup.style.position).toBe("fixed");
    // Anchored to the trigger's own viewport rect: its left edge, 4px below its bottom edge.
    expect(popup.style.left).toBe("300px");
    expect(popup.style.top).toBe("228px");
  });

  it("leaves the popup anchored to its trigger when the scroll box has room", () => {
    const { popup } = openInScroller({
      scroller: { ...tooShort, height: 320 },
      trigger: rowTrigger,
      popup: pickerPopup,
    });

    expect(popup.style.position).toBe("absolute");
    expect(popup.style.top).toBe("");
  });

  it("still shifts an escaped popup that spills past the right edge", () => {
    const { popup } = openInScroller({
      scroller: tooShort,
      trigger: { ...rowTrigger, left: window.innerWidth - 100 },
      popup: pickerPopup,
    });

    // Anchored at the trigger's 924px left edge and 200px wide → 108px past the window's right edge
    // once the 8px margin is honoured, so it slides back by exactly that.
    expect(popup.style.left).toBe(`${window.innerWidth - 100 - 108}px`);
  });

  it("flips an escaped popup above its trigger in pixels, not with bottom:100%", () => {
    const { popup } = openInScroller({
      scroller: { ...tooShort, top: 600 },
      trigger: { ...rowTrigger, top: 604 },
      popup: { ...pickerPopup, top: 628, height: 200 },
    });

    // The trigger's top edge (604) less the popup height (200) and the same 4px gap.
    expect(popup.style.top).toBe("400px");
    expect(popup.style.bottom).toBe("");
  });

  it("leaves a popup too big for the window where the control put it", () => {
    const { popup } = openInScroller({
      scroller: tooShort,
      trigger: rowTrigger,
      popup: { ...pickerPopup, height: window.innerHeight + 100 },
    });

    expect(popup.style.position).toBe("absolute");
  });
});

describe("createPopupHost - dismissing a viewport-anchored popup", () => {
  it("closes an escaped popup when the page scrolls out from under it", () => {
    const { host } = openInScroller({
      scroller: tooShort,
      trigger: rowTrigger,
      popup: pickerPopup,
    });

    document.dispatchEvent(new Event("scroll"));

    expect(host.isOpen).toBe(false);
  });

  it("keeps an escaped popup open while its own contents scroll", () => {
    const { host, popup } = openInScroller({
      scroller: tooShort,
      trigger: rowTrigger,
      popup: pickerPopup,
    });

    popup.dispatchEvent(new Event("scroll"));

    expect(host.isOpen).toBe(true);
  });

  it("stops listening for scroll once the popup is closed", () => {
    const { host } = openInScroller({
      scroller: { ...tooShort, height: 320 },
      trigger: rowTrigger,
      popup: pickerPopup,
    });

    host.close();
    // A stray scroll after close must not throw or reopen; a popup that never escaped never armed
    // the listener in the first place.
    document.dispatchEvent(new Event("scroll"));

    expect(host.isOpen).toBe(false);
  });
});
