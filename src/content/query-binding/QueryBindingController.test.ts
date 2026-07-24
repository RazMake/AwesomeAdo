import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActiveView, QueryBindings } from "../../common/bindings/QueryBinding";
import type { ILogger } from "../../common/logging/ILogger";

import type { BindingButton } from "./BindingButton";
import type { BindingMenu, MenuEntry, MenuItem } from "./BindingMenu";
import { QueryBindingController, type QueryMenuActions } from "./QueryBindingController";

const GUID = "12345678-1234-1234-1234-123456789abc";
const OTHER_GUID = "abcdef00-0000-0000-0000-000000000000";
const queryUrl = (id: string): string => `https://dev.azure.com/org/project/_queries/query/${id}`;

interface ButtonSpy {
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
}

interface MenuSpy {
  isOpen: boolean;
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function makeButtonSpy(): ButtonSpy {
  return { show: vi.fn(), hide: vi.fn() };
}

function makeMenuSpy(): MenuSpy {
  const spy: MenuSpy = {
    isOpen: false,
    open: vi.fn(() => {
      spy.isOpen = true;
    }),
    close: vi.fn(() => {
      spy.isOpen = false;
    }),
  };
  return spy;
}

function makeActions() {
  return {
    openOptions: vi.fn(),
    enableEnhancedView: vi.fn(),
    disableEnhancedView: vi.fn(),
    setActiveView: vi.fn(),
    viewLog: vi.fn(),
  };
}

function makeLoggerSpy(): ILogger {
  return { info: vi.fn(), error: vi.fn() };
}

function bound(id: string, view = "sprint", active: ActiveView = "enhanced"): QueryBindings {
  return { [id]: { view, properties: {}, active } };
}

/** Trigger the click handler the button was wired with, giving it a stand-in anchor element. */
function clickButton(button: ButtonSpy): void {
  const onClick = button.show.mock.calls[0]?.[0] as (anchor: HTMLElement) => void;
  onClick(document.createElement("button"));
}

/** The entries passed to the most recent `menu.open` call. */
function lastEntries(menu: MenuSpy): MenuEntry[] {
  return menu.open.mock.calls.at(-1)?.[1] as MenuEntry[];
}

function items(entries: MenuEntry[]): MenuItem[] {
  return entries.filter((entry): entry is MenuItem => entry.kind === "item");
}

describe("QueryBindingController", () => {
  let button: ButtonSpy;
  let menu: MenuSpy;
  let actions: ReturnType<typeof makeActions>;
  let logger: ILogger;

  beforeEach(() => {
    button = makeButtonSpy();
    menu = makeMenuSpy();
    actions = makeActions();
    logger = makeLoggerSpy();
  });

  function makeController(url: string, configured = true): QueryBindingController {
    const controller = new QueryBindingController(
      button as unknown as BindingButton,
      menu as unknown as BindingMenu,
      actions as unknown as QueryMenuActions,
      url,
      logger,
    );
    // Bound-query menus offer the view swap only once the ADO settings are complete; default the
    // fixture to configured so the swap-focused tests exercise the full menu.
    controller.applyConfigured(configured);
    return controller;
  }

  it("does nothing before the first binding snapshot arrives", () => {
    const controller = makeController(queryUrl(GUID));
    controller.navigate(queryUrl(OTHER_GUID));
    expect(button.show).not.toHaveBeenCalled();
    expect(button.hide).not.toHaveBeenCalled();
  });

  it("shows the button on an unbound query route", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applyBindings({});
    expect(button.show).toHaveBeenCalledTimes(1);
  });

  it("shows the button on a bound query route too", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applyBindings(bound(GUID));
    expect(button.show).toHaveBeenCalledTimes(1);
  });

  it("does not show the button on a non-single-query route", () => {
    const controller = makeController("https://dev.azure.com/org/project/_queries/all");
    controller.applyBindings({});
    expect(button.show).not.toHaveBeenCalled();
  });

  it("does not re-show an already-visible button when bindings change", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applyBindings({});
    button.show.mockClear();

    controller.applyBindings(bound(GUID));

    expect(button.show).not.toHaveBeenCalled();
  });

  it("hides the button when navigating away from a query route", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applyBindings({});
    button.hide.mockClear();

    controller.navigate("https://dev.azure.com/org/project/_boards");

    expect(button.hide).toHaveBeenCalled();
  });

  it("toggles the menu open then closed on successive button clicks", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applyBindings({});
    menu.open.mockClear();
    menu.close.mockClear();

    clickButton(button);
    expect(menu.open).toHaveBeenCalledTimes(1);
    expect(menu.close).not.toHaveBeenCalled();

    clickButton(button);
    expect(menu.close).toHaveBeenCalledTimes(1);
    expect(menu.open).toHaveBeenCalledTimes(1);
  });

  it("anchors the menu to the button element", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applyBindings({});

    const anchor = document.createElement("button");
    (button.show.mock.calls[0]?.[0] as (a: HTMLElement) => void)(anchor);

    expect(menu.open.mock.calls[0]?.[0]).toBe(anchor);
  });

  it("closes an open menu on navigation and on binding changes", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applyBindings({});

    controller.navigate(queryUrl(OTHER_GUID));
    expect(menu.close).toHaveBeenCalled();

    menu.close.mockClear();
    controller.applyBindings(bound(OTHER_GUID));
    expect(menu.close).toHaveBeenCalled();
  });

  describe("unbound menu", () => {
    it("offers Options and Enable Enhanced View above the View Log footer", () => {
      const controller = makeController(queryUrl(GUID));
      controller.applyBindings({});

      clickButton(button);
      const labels = items(lastEntries(menu)).map((item) => item.label);

      expect(labels).toEqual(["Options", "Enable Enhanced View", "View Log"]);
    });

    it("routes Options to openOptions and Enable to enableEnhancedView", () => {
      const controller = makeController(queryUrl(GUID));
      controller.applyBindings({});
      clickButton(button);
      const [options, enable] = items(lastEntries(menu));

      options?.onSelect();
      enable?.onSelect();

      expect(actions.openOptions).toHaveBeenCalledTimes(1);
      expect(actions.enableEnhancedView).toHaveBeenCalledWith(GUID);
    });
  });

  describe("bound menu", () => {
    it("shows the bound view and Standard View with a separator, Options and Disable, then View Log", () => {
      const controller = makeController(queryUrl(GUID));
      controller.applyBindings(bound(GUID, "sprint", "enhanced"));

      clickButton(button);
      const entries = lastEntries(menu);

      expect(entries.map((entry) => entry.kind)).toEqual([
        "item",
        "item",
        "separator",
        "item",
        "item",
        "separator",
        "item",
      ]);
      expect(items(entries).map((item) => item.label)).toEqual([
        "Sprint View",
        "Standard View",
        "Options",
        "Disable Enhanced View",
        "View Log",
      ]);
    });

    it("checks the bound view when it is the active view", () => {
      const controller = makeController(queryUrl(GUID));
      controller.applyBindings(bound(GUID, "sprint", "enhanced"));

      clickButton(button);
      const [view, standard] = items(lastEntries(menu));

      expect(view?.checked).toBe(true);
      expect(standard?.checked).toBe(false);
    });

    it("checks Standard View when the query is showing the standard page", () => {
      const controller = makeController(queryUrl(GUID));
      controller.applyBindings(bound(GUID, "sprint", "standard"));

      clickButton(button);
      const [view, standard] = items(lastEntries(menu));

      expect(view?.checked).toBe(false);
      expect(standard?.checked).toBe(true);
    });

    it("falls back to the raw view id when the view is unknown to this build", () => {
      const controller = makeController(queryUrl(GUID));
      controller.applyBindings(bound(GUID, "future-view", "enhanced"));

      clickButton(button);

      expect(items(lastEntries(menu))[0]?.label).toBe("future-view");
    });

    it("routes each bound entry to its action", () => {
      const controller = makeController(queryUrl(GUID));
      controller.applyBindings(bound(GUID, "sprint", "standard"));
      clickButton(button);
      const [view, standard, options, disable] = items(lastEntries(menu));

      view?.onSelect();
      standard?.onSelect();
      options?.onSelect();
      disable?.onSelect();

      expect(actions.setActiveView).toHaveBeenNthCalledWith(1, GUID, "enhanced");
      expect(actions.setActiveView).toHaveBeenNthCalledWith(2, GUID, "standard");
      expect(actions.openOptions).toHaveBeenCalledTimes(1);
      expect(actions.disableEnhancedView).toHaveBeenCalledWith(GUID);
    });
  });

  describe("bound menu while the ADO settings are incomplete", () => {
    it("hides the view swap and offers only Options and Disable Enhanced View, then View Log", () => {
      const controller = makeController(queryUrl(GUID), false);
      controller.applyBindings(bound(GUID, "sprint", "enhanced"));

      clickButton(button);
      const entries = lastEntries(menu);

      expect(entries.map((entry) => entry.kind)).toEqual(["item", "item", "separator", "item"]);
      expect(items(entries).map((item) => item.label)).toEqual([
        "Options",
        "Disable Enhanced View",
        "View Log",
      ]);
    });

    it("routes its entries to openOptions and disableEnhancedView", () => {
      const controller = makeController(queryUrl(GUID), false);
      controller.applyBindings(bound(GUID, "sprint", "enhanced"));
      clickButton(button);
      const [options, disable] = items(lastEntries(menu));

      options?.onSelect();
      disable?.onSelect();

      expect(actions.openOptions).toHaveBeenCalledTimes(1);
      expect(actions.disableEnhancedView).toHaveBeenCalledWith(GUID);
    });

    it("restores the full swap menu once the settings become complete", () => {
      const controller = makeController(queryUrl(GUID), false);
      controller.applyBindings(bound(GUID, "sprint", "enhanced"));

      controller.applyConfigured(true);
      clickButton(button);

      expect(items(lastEntries(menu)).map((item) => item.label)).toEqual([
        "Sprint View",
        "Standard View",
        "Options",
        "Disable Enhanced View",
        "View Log",
      ]);
    });

    it("closes an open menu when the configured state changes", () => {
      const controller = makeController(queryUrl(GUID), false);
      controller.applyBindings(bound(GUID, "sprint", "enhanced"));
      clickButton(button);
      menu.close.mockClear();

      controller.applyConfigured(true);

      expect(menu.close).toHaveBeenCalled();
    });

    it("ignores a redundant configured update", () => {
      const controller = makeController(queryUrl(GUID), false);
      controller.applyBindings(bound(GUID, "sprint", "enhanced"));
      clickButton(button);
      menu.close.mockClear();

      // Already unconfigured, so re-asserting it must not disturb an open menu.
      controller.applyConfigured(false);

      expect(menu.close).not.toHaveBeenCalled();
    });
  });

  describe("bound query with no explicit override", () => {
    // The binding omits `active`, so the check mark must follow the global default view.
    const noOverride: QueryBindings = { [GUID]: { view: "sprint", properties: {} } };

    it("checks the enhanced entry when the global default is enhanced", () => {
      const controller = makeController(queryUrl(GUID));
      controller.applyDefaultView("enhanced");
      controller.applyBindings(noOverride);

      clickButton(button);
      const [view, standard] = items(lastEntries(menu));

      expect(view?.checked).toBe(true);
      expect(standard?.checked).toBe(false);
    });

    it("checks the standard entry when the global default is original", () => {
      const controller = makeController(queryUrl(GUID));
      controller.applyDefaultView("original");
      controller.applyBindings(noOverride);

      clickButton(button);
      const [view, standard] = items(lastEntries(menu));

      expect(view?.checked).toBe(false);
      expect(standard?.checked).toBe(true);
    });

    it("closes an open menu when the default view changes", () => {
      const controller = makeController(queryUrl(GUID));
      controller.applyBindings(noOverride);
      clickButton(button);
      menu.close.mockClear();

      controller.applyDefaultView("original");

      expect(menu.close).toHaveBeenCalled();
    });
  });

  describe("View Log footer", () => {
    it("routes the footer to the viewLog action on an unbound query", () => {
      const controller = makeController(queryUrl(GUID));
      controller.applyBindings({});
      clickButton(button);

      const viewLog = items(lastEntries(menu)).find((item) => item.label === "View Log");
      viewLog?.onSelect();

      expect(actions.viewLog).toHaveBeenCalledTimes(1);
    });

    it("routes the footer to the viewLog action on a bound query", () => {
      const controller = makeController(queryUrl(GUID));
      controller.applyBindings(bound(GUID, "sprint", "enhanced"));
      clickButton(button);

      const viewLog = items(lastEntries(menu)).find((item) => item.label === "View Log");
      viewLog?.onSelect();

      expect(actions.viewLog).toHaveBeenCalledTimes(1);
    });
  });

  describe("logging", () => {
    it("logs the button showing and the menu opening with the binding state", () => {
      const controller = makeController(queryUrl(GUID));
      controller.applyBindings(bound(GUID, "sprint", "enhanced"));

      const showMessage = vi
        .mocked(logger.info)
        .mock.calls.map((call) => call[0])
        .find((message) => message.includes("Top-bar button shown"));
      expect(showMessage).toContain(GUID);

      clickButton(button);
      const openMessage = vi
        .mocked(logger.info)
        .mock.calls.map((call) => call[0])
        .find((message) => message.includes("Opened top-bar menu"));
      expect(openMessage).toContain("bound");
    });

    it("logs the configured transition only when it flips", () => {
      const controller = makeController(queryUrl(GUID), false);
      vi.mocked(logger.info).mockClear();

      controller.applyConfigured(true);
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(vi.mocked(logger.info).mock.calls[0]?.[0]).toContain("ADO configuration complete");

      // A redundant re-assert of the same state must not log again.
      controller.applyConfigured(true);
      expect(logger.info).toHaveBeenCalledTimes(1);
    });
  });
});
