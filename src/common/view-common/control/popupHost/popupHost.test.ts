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

describe("createPopupHost - staying inside the window", () => {
  /** Open a popup whose laid-out box is fixed at the given viewport rectangle. */
  const openAt = (box: { left: number; top: number; width: number; height: number }) => {
    const trigger = document.createElement("button");
    const mountInto = document.createElement("div");
    mountInto.append(trigger);
    document.body.append(mountInto);
    const popup = document.createElement("div");
    popup.getBoundingClientRect = () =>
      ({
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        right: box.left + box.width,
        bottom: box.top + box.height,
      }) as DOMRect;
    createPopupHost({ doc: document, trigger, mountInto, buildPopup: () => popup });
    trigger.click();
    return popup;
  };

  it("shifts a popup that overflows the right edge back into view", () => {
    // The window is 1024 wide; the popup ends 100px past it, with room to spare on its left.
    const popup = openAt({ left: 900, top: 10, width: 232, height: 40 });

    expect(popup.style.transform).toBe("translate(-116px, 0px)");
  });

  it("never shifts a popup further than the opposite edge allows", () => {
    // Wider than the window: shifting by the full overflow would push its left edge off-screen.
    const popup = openAt({ left: 20, top: 10, width: 1100, height: 40 });

    expect(popup.style.transform).toBe("translate(-12px, 0px)");
  });

  it("shifts a popup that overflows the bottom edge upwards", () => {
    // The window is 768 tall.
    const popup = openAt({ left: 10, top: 700, width: 100, height: 200 });

    expect(popup.style.transform).toBe("translate(0px, -140px)");
  });

  it("leaves a popup that already fits untouched", () => {
    const popup = openAt({ left: 10, top: 10, width: 100, height: 40 });

    expect(popup.style.transform).toBe("");
  });

  it("leaves an unlaid-out popup alone (no viewport to fit it to)", () => {
    const popup = openAt({ left: 0, top: 0, width: 0, height: 0 });

    expect(popup.style.transform).toBe("");
  });
});
