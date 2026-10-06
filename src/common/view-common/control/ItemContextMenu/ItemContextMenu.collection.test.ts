import { beforeEach, describe, expect, it } from "vitest";

import { ItemCollection } from "../../../item-collection/ItemCollection";
import { markCollectProbe, wasCollectProbeHandled } from "../../../item-collection/collectProbe";
import type { ILogger } from "../../../logging/ILogger";

import {
  createItemContextMenu,
  type ItemContextMenu,
  type ItemContextMenuTarget,
} from "./ItemContextMenu";

const logger: ILogger = { info: () => undefined, error: () => undefined };
const URL = "https://dev.azure.com/o/p/_workitems/edit/42";
const ITEM: ItemContextMenuTarget = {
  id: 42,
  url: URL,
  workItem: { title: "Ship it", type: "Feature" },
};

let mount: HTMLElement;
let collection: ItemCollection;
let menu: ItemContextMenu;

beforeEach(() => {
  document.body.innerHTML = "";
  mount = document.createElement("div");
  document.body.append(mount);
  collection = new ItemCollection(logger);
  menu = createItemContextMenu({ doc: document, mountInto: mount, logger, collection });
});

function rightClick(): MouseEvent {
  return new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
}

function probe(): MouseEvent {
  const event = rightClick();
  markCollectProbe(event);
  return event;
}

function labels(): (string | null)[] {
  return [...mount.querySelectorAll(".awesomeado-item-menu__command")].map(
    (row) => row.textContent,
  );
}

function clickCommand(label: string): void {
  [...mount.querySelectorAll<HTMLButtonElement>(".awesomeado-item-menu__command")]
    .find((row) => row.textContent === label)!
    .click();
}

describe("createItemContextMenu collection command", () => {
  it("offers Start collecting after the standard commands of a work item", () => {
    menu.openAt(rightClick(), ITEM);
    expect(labels()).toEqual([
      "Copy Item ID",
      "Copy ADO Url",
      "Open in ADO",
      "Start collecting work items",
    ]);
  });

  it("starts a collection with the right-clicked item, then offers End collection", () => {
    menu.openAt(rightClick(), ITEM);
    clickCommand("Start collecting work items");
    expect(collection.isActive).toBe(true);
    expect(collection.items()).toEqual([{ id: 42, title: "Ship it", type: "Feature", url: URL }]);
    expect(mount.querySelector(".awesomeado-item-menu")).toBeNull();

    menu.openAt(rightClick(), ITEM);
    expect(labels()).toContain("End collection");
    expect(labels()).not.toContain("Start collecting work items");
    clickCommand("End collection");
    expect(collection.isActive).toBe(false);
  });

  it("offers Collect current item above End collection while collecting", () => {
    collection.start();
    menu.openAt(rightClick(), ITEM);
    expect(labels().slice(-2)).toEqual(["Collect current item", "End collection"]);
    clickCommand("Collect current item");
    expect(collection.items().map((item) => item.id)).toEqual([42]);

    menu.openAt(rightClick(), ITEM);
    expect(labels().slice(-2)).toEqual(["Remove current item", "End collection"]);
    clickCommand("Remove current item");
    expect(collection.items()).toEqual([]);
    expect(collection.isActive).toBe(true);
  });

  it("omits the command on a target that is not a work item", () => {
    menu.openAt(rightClick(), { id: 0, url: URL, standardCommands: ["copy-url"] });
    expect(labels()).toEqual(["Copy ADO Url"]);
  });

  it("omits the command when the menu has no collection", () => {
    const plain = createItemContextMenu({ doc: document, mountInto: mount, logger });
    plain.openAt(rightClick(), ITEM);
    expect(labels()).not.toContain("Start collecting work items");
  });
});

describe("createItemContextMenu collection probes", () => {
  it("adds the item on a Ctrl+click probe instead of opening, never removing it", () => {
    collection.start();
    const event = probe();
    menu.openAt(event, ITEM);
    expect(mount.querySelector(".awesomeado-item-menu")).toBeNull();
    expect(wasCollectProbeHandled(event)).toBe(true);
    expect(collection.items()).toEqual([{ id: 42, title: "Ship it", type: "Feature", url: URL }]);

    const again = probe();
    menu.openAt(again, ITEM);
    expect(wasCollectProbeHandled(again)).toBe(true);
    expect(collection.items()).toHaveLength(1);
  });

  it("swallows a probe without collecting while no collection runs", () => {
    const event = probe();
    menu.openAt(event, ITEM);
    expect(mount.querySelector(".awesomeado-item-menu")).toBeNull();
    expect(wasCollectProbeHandled(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves a probe on a non-item target unhandled", () => {
    collection.start();
    const event = probe();
    menu.openAt(event, { id: 0, url: URL });
    expect(wasCollectProbeHandled(event)).toBe(false);
    expect(collection.items()).toEqual([]);
  });
});
