import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ILogger } from "../../../logging/ILogger";

import {
  createItemContextMenu,
  type ItemContextMenu,
  type ItemContextMenuCommand,
} from "./ItemContextMenu";

function fakeLogger(): ILogger & { infos: string[]; errors: string[] } {
  const infos: string[] = [];
  const errors: string[] = [];
  return {
    infos,
    errors,
    info: (message) => infos.push(message),
    error: (message) => errors.push(message),
  };
}

function rightClick(x = 40, y = 60): MouseEvent {
  return new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y });
}

/**
 * Lets a clipboard write's promise chain settle. The whole path is microtasks, so nothing here waits
 * on a real timer.
 */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) {
    await Promise.resolve();
  }
}

let mount: HTMLElement;
let logger: ReturnType<typeof fakeLogger>;
let writeText: ReturnType<typeof vi.fn>;
let menu: ItemContextMenu;

beforeEach(() => {
  document.body.innerHTML = "";
  mount = document.createElement("div");
  document.body.append(mount);
  logger = fakeLogger();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  menu = createItemContextMenu({ doc: document, mountInto: mount, logger });
});

function commands(): HTMLButtonElement[] {
  return [...mount.querySelectorAll<HTMLButtonElement>(".awesomeado-item-menu__command")];
}

/** The menu's nth command, asserted present so each test reads without an index guard. */
function command(index: number): HTMLButtonElement {
  const found = commands()[index];
  if (!found) {
    throw new Error(`The open menu has no command at index ${index}.`);
  }
  return found;
}

function openMenu(id = 42, url: string | null = "https://dev.azure.com/o/p/_workitems/edit/42") {
  const event = rightClick();
  menu.openAt(event, { id, url });
  return event;
}

describe("createItemContextMenu opening", () => {
  it("opens the three shared commands, in order", () => {
    openMenu();
    expect(commands().map((command) => command.textContent)).toEqual([
      "Copy Item ID",
      "Copy ADO Url",
      "Open in ADO",
    ]);
  });

  it("replaces the browser's own menu and lets the innermost row win", () => {
    const event = openMenu();
    expect(event.defaultPrevented).toBe(true);
    expect(event.cancelBubble).toBe(true);
  });

  it("anchors the menu at the pointer", () => {
    menu.openAt(rightClick(120, 240), { id: 7, url: null });
    const anchor = mount.querySelector<HTMLElement>(".awesomeado-item-menu__anchor");
    expect(anchor?.style.left).toBe("120px");
    expect(anchor?.style.top).toBe("240px");
  });

  it("replaces an already-open menu instead of stacking a second one", () => {
    openMenu(1);
    openMenu(2);
    expect(mount.querySelectorAll(".awesomeado-item-menu")).toHaveLength(1);
    command(0).click();
    expect(writeText).toHaveBeenCalledWith("2");
  });

  it("suppresses the browser menu on the menu itself", () => {
    openMenu();
    const event = rightClick();
    mount.querySelector(".awesomeado-item-menu")?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps a nested row's menu when the gesture would also reach its parent", () => {
    const parent = document.createElement("div");
    const child = document.createElement("div");
    parent.append(child);
    mount.append(parent);
    parent.addEventListener("contextmenu", (event) => menu.openAt(event, { id: 1, url: null }));
    child.addEventListener("contextmenu", (event) => menu.openAt(event, { id: 2, url: null }));

    child.dispatchEvent(rightClick());
    command(0).click();
    expect(writeText).toHaveBeenCalledWith("2");
  });
});

describe("createItemContextMenu commands", () => {
  const url = "https://dev.azure.com/o/p/_workitems/edit/42";

  it("copies the item id and closes", () => {
    openMenu();
    command(0).click();
    expect(writeText).toHaveBeenCalledWith("42");
    expect(mount.querySelector(".awesomeado-item-menu")).toBeNull();
  });

  it("copies the ADO url and closes", () => {
    openMenu();
    command(1).click();
    expect(writeText).toHaveBeenCalledWith(url);
    expect(mount.querySelector(".awesomeado-item-menu")).toBeNull();
  });

  it("opens the item in a new tab without handing it a window reference", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    openMenu();
    command(2).click();
    expect(open).toHaveBeenCalledWith(url, "_blank", "noopener");
    expect(mount.querySelector(".awesomeado-item-menu")).toBeNull();
  });

  it("draws the tab-opening command in its own color", () => {
    openMenu();
    expect(command(2).style.color).not.toBe("");
    expect(command(2).style.color).not.toBe(command(0).style.color);
  });

  it("highlights the command under the pointer", () => {
    openMenu();
    const copyId = command(0);
    copyId.dispatchEvent(new MouseEvent("mouseenter"));
    expect(copyId.style.backgroundColor).toBe("var(--control-background-hover)");
    copyId.dispatchEvent(new MouseEvent("mouseleave"));
    expect(copyId.style.backgroundColor).toBe("transparent");
  });

  it("draws the menu edge with the strong control border role", () => {
    openMenu();
    const menuSurface = mount.querySelector<HTMLElement>(".awesomeado-item-menu");
    expect(menuSurface?.style.border).toContain("var(--control-border-strong)");
  });
});

describe("createItemContextMenu without a resolvable url", () => {
  it("keeps both url commands in place but inert", () => {
    openMenu(42, null);
    expect(command(0).disabled).toBe(false);
    expect(command(1).disabled).toBe(true);
    expect(command(2).disabled).toBe(true);
    expect(command(1).title).toContain("Azure DevOps project");
  });

  it("records why those commands cannot run", () => {
    openMenu(42, null);
    expect(logger.infos).toHaveLength(1);
    expect(logger.infos[0]).toContain("Item 42");
  });

  it("says nothing when every command can run", () => {
    openMenu();
    expect(logger.infos).toEqual([]);
  });
});

describe("createItemContextMenu clipboard failures", () => {
  it("records a rejected write rather than losing it with the closed menu", async () => {
    writeText.mockRejectedValue(new Error("not focused"));
    openMenu();
    command(0).click();
    await settle();
    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0]).toContain("Copy Item ID");
  });

  it("records a context with no clipboard at all", async () => {
    Object.defineProperty(window.navigator, "clipboard", { value: undefined, configurable: true });
    openMenu();
    command(1).click();
    await settle();
    expect(logger.errors[0]).toContain("Copy ADO Url");
  });
});

describe("createItemContextMenu dismissal", () => {
  it("closes on a pointerdown outside it", () => {
    openMenu();
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(mount.querySelector(".awesomeado-item-menu")).toBeNull();
  });

  it("closes on Escape", () => {
    openMenu();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(mount.querySelector(".awesomeado-item-menu")).toBeNull();
  });

  it("closes on demand, and closing again is harmless", () => {
    openMenu();
    menu.close();
    menu.close();
    expect(mount.querySelector(".awesomeado-item-menu")).toBeNull();
  });
});

/** Opens the menu with a caller-supplied second group. */
function openWithCommands(commands: ItemContextMenuCommand[]): void {
  menu.openAt(rightClick(), { id: 42, url: null, commands });
}

describe("createItemContextMenu with the caller's own commands", () => {
  it("puts them under a rule, after the three every menu carries", () => {
    openWithCommands([{ label: "Rename", run: () => undefined }]);

    expect(commands()).toHaveLength(4);
    expect(command(3).textContent).toBe("Rename");
    expect(mount.querySelectorAll(".awesomeado-item-menu__separator")).toHaveLength(1);
  });

  it("draws no rule when the caller supplied none", () => {
    openMenu();
    expect(mount.querySelector(".awesomeado-item-menu__separator")).toBeNull();
  });

  it("runs an action and closes", () => {
    const run = vi.fn();
    openWithCommands([{ label: "Rename", run }]);

    command(3).click();

    expect(run).toHaveBeenCalledTimes(1);
    expect(mount.querySelector(".awesomeado-item-menu")).toBeNull();
  });

  it("paints a command with the declarations it was given", () => {
    openWithCommands([{ label: "Next sprint", declarations: [["color", "rgb(1, 2, 3)"]] }]);

    expect(command(3).style.color).toBe("rgb(1, 2, 3)");
  });

  it("shows a caller-supplied tooltip for an abbreviated command label", () => {
    openWithCommands([{ label: "Platform \u203A API", title: "Project\\Platform\\API" }]);

    expect(command(3).title).toBe("Project\\Platform\\API");
  });

  it("leaves a command that cannot run in place, dimmed, saying why", () => {
    openWithCommands([{ label: "Move", disabledReason: "No other sprint.", run: vi.fn() }]);

    expect(command(3).disabled).toBe(true);
    expect(command(3).title).toBe("No other sprint.");
  });
});

describe("createItemContextMenu panels", () => {
  it("replaces the commands with the panel, in the place the reader right-clicked", () => {
    const panel = document.createElement("div");
    panel.id = "editor";
    openWithCommands([{ label: "Rename", panel: () => panel }]);

    command(3).click();

    expect(mount.querySelector("#editor")).not.toBeNull();
    expect(commands()).toHaveLength(0);
    // Still the same anchored surface, so the popup host's dismissal still covers it.
    expect(mount.querySelector(".awesomeado-item-menu")).not.toBeNull();
  });

  it("hands the panel a close that dismisses the whole menu", () => {
    let dismiss = (): void => undefined;
    openWithCommands([
      {
        label: "Rename",
        panel: (close) => {
          dismiss = close;
          return document.createElement("div");
        },
      },
    ]);

    command(3).click();
    dismiss();

    expect(mount.querySelector(".awesomeado-item-menu")).toBeNull();
  });

  it("centres a panel that asked for it, whatever anchoring the host had already applied", () => {
    const surface = mount.querySelector<HTMLElement>(".awesomeado-item-menu");
    openWithCommands([
      { label: "Notes", centerPanel: true, panel: () => document.createElement("div") },
    ]);
    const menuSurface = mount.querySelector<HTMLElement>(".awesomeado-item-menu")!;
    // Whatever the host left behind must be overwritten, not merely added to.
    menuSurface.style.bottom = "100%";
    menuSurface.style.marginTop = "12px";
    expect(surface).toBeNull();

    command(3).click();

    expect(menuSurface.style.position).toBe("fixed");
    expect(menuSurface.style.left).toBe("50%");
    expect(menuSurface.style.top).toBe("50%");
    expect(menuSurface.style.bottom).toBe("auto");
    expect(menuSurface.style.transform).toBe("translate(-50%, -50%)");
  });
});

describe("createItemContextMenu panel sizing and dismissal", () => {
  it("maximizes inside its surface with a ten-pixel inset and restores its original size", () => {
    const panel = document.createElement("div");
    panel.style.cssText = "width:70vw;max-width:90vw;height:70vh";
    const panelBounds = document.createElement("section");
    panelBounds.getBoundingClientRect = () =>
      ({ top: 70, left: 180, right: 980, bottom: 720, width: 800, height: 650 }) as DOMRect;
    menu = createItemContextMenu({
      doc: document,
      mountInto: mount,
      panelBounds: () => panelBounds,
      logger,
    });
    openWithCommands([
      {
        label: "Notes",
        centerPanel: true,
        maximizablePanel: true,
        panel: () => panel,
      },
    ]);
    const menuSurface = mount.querySelector<HTMLElement>(".awesomeado-item-menu")!;

    command(3).click();
    const maximize = mount.querySelector<HTMLButtonElement>('[aria-label="Maximize panel"]')!;
    const iconSize = maximize.querySelector<HTMLElement>(".awesomeado-item-menu__panel-size-icon")!;
    expect(iconSize.style.width).toBe("14px");
    expect(iconSize.style.height).toBe("14px");
    expect(maximize.querySelectorAll(".awesomeado-item-menu__window-outline")).toHaveLength(1);
    expect(
      maximize.querySelector<HTMLElement>(".awesomeado-item-menu__window-outline")?.style.inset,
    ).toBe("2px");
    maximize.click();

    expect(menuSurface.style.position).toBe("fixed");
    expect(menuSurface.style.top).toBe("80px");
    expect(menuSurface.style.left).toBe("190px");
    expect(menuSurface.style.right).toBe("54px");
    expect(menuSurface.style.bottom).toBe("58px");
    expect(menuSurface.style.transform).toBe("none");
    expect(panel.style.width).toBe("100%");
    expect(panel.style.maxWidth).toBe("none");
    expect(panel.style.height).toBe("100%");
    expect(maximize.getAttribute("aria-label")).toBe("Restore panel");
    expect(maximize.querySelectorAll(".awesomeado-item-menu__window-outline")).toHaveLength(2);
    expect(
      maximize.querySelector<HTMLElement>(".awesomeado-item-menu__panel-size-icon")?.style.width,
    ).toBe("14px");

    maximize.click();

    expect(menuSurface.style.left).toBe("50%");
    expect(menuSurface.style.top).toBe("50%");
    expect(menuSurface.style.transform).toBe("translate(-50%, -50%)");
    expect(panel.style.width).toBe("70vw");
    expect(panel.style.maxWidth).toBe("90vw");
    expect(panel.style.height).toBe("70vh");
    expect(maximize.getAttribute("aria-label")).toBe("Maximize panel");
  });

  it("leaves an ordinary panel anchored where the reader right-clicked", () => {
    openWithCommands([{ label: "Rename", panel: () => document.createElement("div") }]);
    const menuSurface = mount.querySelector<HTMLElement>(".awesomeado-item-menu")!;

    command(3).click();

    expect(menuSurface.style.position).toBe("absolute");
  });

  it("keeps an editor's Escape for the editor, and closes on the next one", () => {
    const field = document.createElement("textarea");
    openWithCommands([{ label: "Rename", panel: () => field }]);
    command(3).click();

    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(mount.querySelector(".awesomeado-item-menu")).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(mount.querySelector(".awesomeado-item-menu")).toBeNull();
  });
});

describe("createItemContextMenu submenus", () => {
  const withSubmenu = (nested: ItemContextMenuCommand[]): void =>
    openWithCommands([{ label: "Move", submenu: () => nested }]);

  const flyout = (): HTMLElement | null =>
    mount.querySelector<HTMLElement>(".awesomeado-item-menu__submenu");

  it("says it leads somewhere before it is pointed at", () => {
    withSubmenu([{ label: "Sprint 2" }]);

    expect(command(3).textContent).toBe("Move\u203A");
    expect(flyout()).toBeNull();
  });

  it("opens the nested commands beside the row", () => {
    withSubmenu([{ label: "Sprint 2" }, { label: "Sprint 3" }]);

    command(3).click();

    expect([...(flyout()?.querySelectorAll("button") ?? [])].map((row) => row.textContent)).toEqual(
      ["Sprint 2", "Sprint 3"],
    );
  });

  it("builds the nested commands on open, so they describe the item as it is now", () => {
    let built = 0;
    openWithCommands([
      {
        label: "Move",
        submenu: () => {
          built += 1;
          return [{ label: "Sprint 2" }];
        },
      },
    ]);
    expect(built).toBe(0);

    command(3).click();

    expect(built).toBe(1);
  });

  it("runs a nested command and closes the whole menu", () => {
    const run = vi.fn();
    withSubmenu([{ label: "Sprint 2", run }]);

    command(3).click();
    flyout()!.querySelector("button")!.click();

    expect(run).toHaveBeenCalledTimes(1);
    expect(mount.querySelector(".awesomeado-item-menu")).toBeNull();
  });

  it("takes the flyout away once the pointer leaves the row it belongs to", () => {
    withSubmenu([{ label: "Sprint 2" }]);

    command(3).click();
    expect(flyout()).not.toBeNull();

    mount
      .querySelector(".awesomeado-item-menu__submenu-host")!
      .dispatchEvent(new MouseEvent("mouseleave"));

    expect(flyout()).toBeNull();
  });
});
