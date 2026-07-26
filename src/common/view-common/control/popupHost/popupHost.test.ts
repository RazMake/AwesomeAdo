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

  it("keeps a popup below its trigger when it is too tall to fit above", () => {
    const popup = openWithBox({ left: 10, top: 40, width: 200, height: window.innerHeight });

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
