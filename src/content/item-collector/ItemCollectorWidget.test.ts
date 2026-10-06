import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TypeCatalogEntry } from "../../common/ado/TrackedWorkItem";
import { ItemCollection } from "../../common/item-collection/ItemCollection";
import type { ILogger } from "../../common/logging/ILogger";
import type { RelativeViewportPosition } from "../../common/settings/ExtensionSettings";
import {
  createItemContextMenu,
  type ItemContextMenuTarget,
} from "../../common/view-common/control/ItemContextMenu/ItemContextMenu";

import { ItemCollectorWidget } from "./ItemCollectorWidget";

const URL_7 = "https://dev.azure.com/o/p/_workitems/edit/7";
const FEATURE_TYPE: TypeCatalogEntry = {
  name: "Feature",
  color: "#773b93",
  icon: "https://icons/feature.svg",
  etaField: null,
  columns: [],
};

let logger: ILogger & { infos: string[]; errors: unknown[] };
let collection: ItemCollection;
let widget: ItemCollectorWidget;
let row: HTMLElement;
let writeText: ReturnType<typeof vi.fn>;
let write: ReturnType<typeof vi.fn>;
let persistPosition: ReturnType<
  typeof vi.fn<(position: RelativeViewportPosition) => Promise<void>>
>;

function fakeLogger(): typeof logger {
  const infos: string[] = [];
  const errors: unknown[] = [];
  return {
    infos,
    errors,
    info: (message) => infos.push(message),
    error: (_message, error) => errors.push(error),
  };
}

/** A view-like row wired to an item context menu, as every enhanced view does. */
function mountRow(target: ItemContextMenuTarget): HTMLElement {
  const element = document.createElement("div");
  element.className = "row";
  const menu = createItemContextMenu({ doc: document, mountInto: element, logger, collection });
  element.addEventListener("contextmenu", (event) => menu.openAt(event, target));
  document.body.append(element);
  return element;
}

function ctrlClick(target: Element): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
  target.dispatchEvent(event);
  return event;
}

function root(): HTMLElement | null {
  return document.getElementById("awesomeado-item-collector");
}

function count(): string | null | undefined {
  return root()?.querySelector(".awesomeado-item-collector__count")?.textContent;
}

function openMenu(): HTMLButtonElement[] {
  root()!
    .querySelector<HTMLButtonElement>(".awesomeado-item-collector__button")!
    .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  return [...root()!.querySelectorAll<HTMLButtonElement>(".awesomeado-item-collector__command")];
}

function runCommand(label: string): void {
  openMenu()
    .find((command) => command.textContent === label)!
    .click();
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await Promise.resolve();
}

function pointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX: number,
  clientY: number,
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

beforeEach(() => {
  document.body.innerHTML = "";
  logger = fakeLogger();
  collection = new ItemCollection(logger);
  writeText = vi.fn().mockResolvedValue(undefined);
  write = vi.fn().mockResolvedValue(undefined);
  persistPosition = vi
    .fn<(position: RelativeViewportPosition) => Promise<void>>()
    .mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText, write },
    configurable: true,
  });
  widget = new ItemCollectorWidget(
    document,
    collection,
    (type) => (type === "Feature" ? FEATURE_TYPE : undefined),
    logger,
    persistPosition,
  );
  row = mountRow({ id: 7, url: URL_7, workItem: { title: "Ship it", type: "Feature" } });
});

afterEach(() => {
  widget.dispose();
  vi.unstubAllGlobals();
});

describe("ItemCollectorWidget visibility", () => {
  it("shows nothing until a collection starts, then a zero counter", () => {
    expect(root()).toBeNull();
    collection.start();
    expect(count()).toBe("0");
    expect(root()!.querySelector("button")!.getAttribute("aria-label")).toContain(
      "Collected work items: 0",
    );
  });

  it("puts itself back when the page drops it", async () => {
    collection.start();
    root()!.remove();
    document.body.append(document.createElement("span"));
    await settle();
    expect(root()).not.toBeNull();
  });

  it("removes itself and its listeners when the collection ends", () => {
    collection.start();
    runCommand("End collection");
    expect(collection.isActive).toBe(false);
    expect(root()).toBeNull();
    collection.start();
    widget.dispose();
    expect(root()).toBeNull();
  });

  it("pins the chosen theme onto its own root", () => {
    collection.start();
    widget.applyTheme("dark");
    expect(root()!.style.getPropertyValue("color-scheme")).toBe("dark");
    expect(root()!.style.getPropertyValue("--remove-control-color")).not.toBe("");
  });
});

describe("ItemCollectorWidget Ctrl+click", () => {
  it("adds the clicked work item once, spends the click, and bursts only on an addition", () => {
    const animate = vi.fn(() => ({ onfinish: null, oncancel: null }));
    HTMLElement.prototype.animate = animate as unknown as HTMLElement["animate"];
    collection.start();
    const first = ctrlClick(row);
    expect(first.defaultPrevented).toBe(true);
    expect(count()).toBe("1");
    const burst = document.querySelector<HTMLElement>(".awesomeado-item-collector__added-burst")!;
    expect(burst.querySelector("img")!.getAttribute("src")).toBe(FEATURE_TYPE.icon);
    expect(burst.getAttribute("aria-hidden")).toBe("true");
    expect(parseInt(burst.style.left, 10)).toBeGreaterThan(0);
    const animation = animate.mock.results[0]!.value as { onfinish: () => void };
    animation.onfinish();
    expect(burst.isConnected).toBe(false);

    const second = ctrlClick(row);
    expect(second.defaultPrevented).toBe(true);
    expect(count()).toBe("1");
    expect(animate).toHaveBeenCalledTimes(1);
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });

  it("skips the burst without animation support and only fades it under reduced motion", () => {
    collection.start();
    ctrlClick(row);
    expect(document.querySelector(".awesomeado-item-collector__added-burst")).toBeNull();
    collection.remove(7);
    const animate = vi.fn(() => ({ onfinish: null, oncancel: null }));
    HTMLElement.prototype.animate = animate as unknown as HTMLElement["animate"];
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    ctrlClick(row);
    expect(count()).toBe("1");
    const frames = (animate.mock.calls[0] as unknown as [Keyframe[]])[0];
    expect(frames.every((frame) => !String(frame.transform).includes("rotate"))).toBe(true);
    delete (window as Partial<Window>).matchMedia;
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });

  it("leaves plain clicks, other buttons, and clicks on itself alone", () => {
    collection.start();
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    row.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true, button: 1 }));
    ctrlClick(root()!.querySelector("button")!);
    expect(collection.items()).toEqual([]);
  });

  it("keeps a Ctrl+click on something that is not an item ordinary", () => {
    collection.start();
    const outside = document.createElement("a");
    document.body.append(outside);
    expect(ctrlClick(outside).defaultPrevented).toBe(false);
  });

  it("stops listening once the collection ends", () => {
    collection.start();
    collection.end();
    collection.start();
    collection.end();
    expect(ctrlClick(row).defaultPrevented).toBe(false);
  });
});

describe("ItemCollectorWidget menu", () => {
  it("opens on right-click without the collected-items command", () => {
    collection.start();
    const commands = openMenu();
    expect(commands.map((command) => command.textContent)).toEqual([
      "Copy all Ids to clipboard",
      "Copy all ADO links to clipboard",
      "End collection",
    ]);
    expect(commands.map((command) => command.disabled)).toEqual([true, true, false]);
  });

  it("highlights the command under the pointer", () => {
    collection.start();
    collection.toggle({ id: 9, title: "Crash", type: "Bug", url: null });
    const [copyIds] = openMenu();
    copyIds!.dispatchEvent(new MouseEvent("mouseenter"));
    expect(copyIds!.style.backgroundColor).toBe("var(--control-background-hover)");
    copyIds!.dispatchEvent(new MouseEvent("mouseleave"));
    expect(copyIds!.style.backgroundColor).toBe("transparent");
  });

  it("copies the ids comma separated", async () => {
    collection.start();
    ctrlClick(row);
    collection.toggle({ id: 9, title: "Crash", type: "Bug", url: null });
    runCommand("Copy all Ids to clipboard");
    await settle();
    expect(writeText).toHaveBeenCalledWith("7, 9");
    expect(root()!.querySelector(".awesomeado-item-collector__menu")).toBeNull();
  });

  it("copies the links as rich text when the browser supports it", async () => {
    class FakeClipboardItem {
      constructor(readonly data: Record<string, Blob>) {}
    }
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    collection.start();
    ctrlClick(row);
    runCommand("Copy all ADO links to clipboard");
    await settle();
    const [[items]] = write.mock.calls as [[FakeClipboardItem[]]];
    expect(Object.keys(items[0]!.data)).toEqual(["text/plain", "text/html"]);
  });

  it("falls back to plain text links without ClipboardItem", async () => {
    vi.stubGlobal("ClipboardItem", undefined);
    collection.start();
    ctrlClick(row);
    runCommand("Copy all ADO links to clipboard");
    await settle();
    expect(writeText).toHaveBeenCalledWith(`#7 Feature Ship it - ${URL_7}`);
  });

  it("logs a refused clipboard write", async () => {
    const refusal = new Error("denied");
    writeText.mockRejectedValue(refusal);
    collection.start();
    ctrlClick(row);
    runCommand("Copy all Ids to clipboard");
    await settle();
    expect(logger.errors).toContain(refusal);
  });

  it("logs a missing clipboard", async () => {
    Object.defineProperty(window.navigator, "clipboard", { value: undefined, configurable: true });
    collection.start();
    ctrlClick(row);
    runCommand("Copy all Ids to clipboard");
    await settle();
    expect(logger.errors).toHaveLength(1);
  });
});

describe("ItemCollectorWidget dialog", () => {
  function dialog(): HTMLElement | null {
    return root()?.querySelector(".awesomeado-item-collector__dialog") ?? null;
  }

  it("says how to collect while empty", () => {
    collection.start();
    root()!.querySelector<HTMLButtonElement>(".awesomeado-item-collector__button")!.click();
    expect(dialog()!.textContent).toContain("Collected work items (0)");
    expect(dialog()!.textContent).toContain("Ctrl+click work items");
  });

  it("lists each item as remove, linked id, type icon, and title, and follows changes", () => {
    collection.start();
    root()!.querySelector<HTMLButtonElement>(".awesomeado-item-collector__button")!.click();
    ctrlClick(row);
    collection.toggle({ id: 9, title: "Crash", type: "Bug", url: null });
    const rows = [
      ...dialog()!.querySelectorAll<HTMLElement>(".awesomeado-item-collector__dialog-item"),
    ];
    expect(rows).toHaveLength(2);
    const link = rows[0]!.querySelector<HTMLAnchorElement>("a")!;
    expect(link.textContent).toBe("#7");
    expect(link.href).toBe(URL_7);
    expect(link.target).toBe("_blank");
    expect(rows[0]!.querySelector("img")!.getAttribute("src")).toBe(FEATURE_TYPE.icon);
    expect(rows[0]!.textContent).toContain("Ship it");
    expect(rows[1]!.querySelector("a")).toBeNull();
    expect(rows[1]!.textContent).toContain("#9");

    rows[0]!.querySelector<HTMLButtonElement>(".awesomeado-item-collector__dialog-remove")!.click();
    expect(collection.items().map((item) => item.id)).toEqual([9]);
    expect(dialog()!.querySelectorAll(".awesomeado-item-collector__dialog-item")).toHaveLength(1);
  });

  it("opens only once and closes from its button or Escape", () => {
    collection.start();
    const button = root()!.querySelector<HTMLButtonElement>(".awesomeado-item-collector__button")!;
    button.click();
    button.click();
    expect(root()!.querySelectorAll(".awesomeado-item-collector__dialog")).toHaveLength(1);
    dialog()!.querySelector<HTMLButtonElement>(".awesomeado-item-collector__dialog-close")!.click();
    expect(dialog()).toBeNull();

    button.click();
    dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(dialog()).not.toBeNull();
    dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(dialog()).toBeNull();

    button.click();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(dialog()).toBeNull();
    expect(collection.isActive).toBe(true);
  });

  it("copies ids and urls from its buttons, disabled while empty", async () => {
    collection.start();
    root()!.querySelector<HTMLButtonElement>(".awesomeado-item-collector__button")!.click();
    const copyIds = dialog()!.querySelector<HTMLButtonElement>(
      ".awesomeado-item-collector__dialog-copy-ids",
    )!;
    const copyUrls = dialog()!.querySelector<HTMLButtonElement>(
      ".awesomeado-item-collector__dialog-copy-urls",
    )!;
    expect(copyIds.disabled).toBe(true);
    expect(copyUrls.disabled).toBe(true);

    ctrlClick(row);
    expect(copyIds.disabled).toBe(false);
    copyIds.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith("7");
    vi.stubGlobal("ClipboardItem", undefined);
    copyUrls.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith(`#7 Feature Ship it - ${URL_7}`);
  });
});

describe("ItemCollectorWidget Escape", () => {
  it("ends the collection on Escape when no list is open, unless already handled", () => {
    collection.start();
    const handled = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    document.body.dispatchEvent(handled);
    expect(collection.isActive).toBe(true);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(collection.isActive).toBe(false);
    expect(root()).toBeNull();
  });
});

describe("ItemCollectorWidget start placement", () => {
  it("appears beside the last pointer press when a collection starts", () => {
    document.body.dispatchEvent(pointerEvent("pointerdown", 100, 120));
    collection.start();
    expect(root()!.style.left).toBe("116px");
    expect(root()!.style.top).toBe("136px");
  });
});

describe("ItemCollectorWidget position", () => {
  it("applies a synced relative position", () => {
    widget.applyPosition({ x: 0.5, y: 0.25 });
    collection.start();

    expect(root()!.style.left).toBe(`${Math.round(window.innerWidth * 0.5)}px`);
    expect(root()!.style.top).toBe(`${Math.round(window.innerHeight * 0.25)}px`);
    expect(root()!.style.right).toBe("auto");
    expect(root()!.style.bottom).toBe("auto");
  });

  it("drags within the viewport, saves a relative position, and does not open the dialog", () => {
    collection.start();
    const button = root()!.querySelector<HTMLButtonElement>(".awesomeado-item-collector__button")!;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      x: 900,
      y: 700,
      left: 900,
      top: 700,
      right: 1000,
      bottom: 740,
      width: 100,
      height: 40,
      toJSON: () => ({}),
    });

    button.dispatchEvent(pointerEvent("pointerdown", 920, 720));
    document.dispatchEvent(pointerEvent("pointermove", 420, 320));
    document.dispatchEvent(pointerEvent("pointerup", 420, 320));
    button.click();

    expect(root()!.style.left).toBe("400px");
    expect(root()!.style.top).toBe("300px");
    expect(persistPosition).toHaveBeenCalledWith({
      x: 400 / (window.innerWidth - 100),
      y: 300 / (window.innerHeight - 40),
    });
    expect(root()!.querySelector(".awesomeado-item-collector__dialog")).toBeNull();
  });

  it("logs a position save failure", async () => {
    const refusal = new Error("sync failed");
    persistPosition.mockRejectedValue(refusal);
    collection.start();
    const button = root()!.querySelector<HTMLButtonElement>(".awesomeado-item-collector__button")!;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      x: 24,
      y: 24,
      left: 24,
      top: 24,
      right: 124,
      bottom: 64,
      width: 100,
      height: 40,
      toJSON: () => ({}),
    });

    button.dispatchEvent(pointerEvent("pointerdown", 30, 30));
    document.dispatchEvent(pointerEvent("pointermove", 50, 50));
    document.dispatchEvent(pointerEvent("pointerup", 50, 50));
    await settle();

    expect(logger.errors).toContain(refusal);
  });
});
