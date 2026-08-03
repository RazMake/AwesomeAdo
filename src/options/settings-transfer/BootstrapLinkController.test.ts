import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IQueryBindingStore } from "../../common/bindings/IQueryBindingStore";
import type { QueryBindings } from "../../common/bindings/QueryBinding";
import type { StorageObservation } from "../../common/browser/observeStorageKeys";
import { SHARED_CONFIG_PARAM } from "../../common/navigation/SharedQueryLink";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";
import type { ObservableTeamConfigSource } from "../../common/settings-transfer/TeamConfigSourceStore";

import { BootstrapLinkController, type BootstrapLinkElements } from "./BootstrapLinkController";

/** A store whose observation is driven by the test rather than by storage. */
class FakeObservable<T> {
  private listener: ((value: T) => void) | null = null;
  readonly unsubscribe = vi.fn();

  observe = (listener: (value: T) => void): StorageObservation => {
    this.listener = listener;
    return { ready: Promise.resolve(), unsubscribe: this.unsubscribe };
  };

  emit(value: T): void {
    this.listener?.(value);
  }
}

class FakeSettingsStore extends FakeObservable<ExtensionSettings> implements ISettingsStore {
  read = vi.fn(async () => DEFAULT_SETTINGS);
  write = vi.fn(async () => {});
}

class FakeBindingStore extends FakeObservable<QueryBindings> implements IQueryBindingStore {
  read = vi.fn(async () => ({}) as QueryBindings);
  bind = vi.fn(async () => {});
  unbind = vi.fn(async () => {});
  replaceAll = vi.fn(async () => {});
}

class FakeTeamConfigSource
  extends FakeObservable<number | null>
  implements ObservableTeamConfigSource {}

const QUERY_ID = "2f6a1b4c-0000-4a11-9f00-abcdef012345";
const OTHER_QUERY_ID = "11111111-1111-4111-8111-111111111111";

const settings = (): ExtensionSettings => ({
  ...DEFAULT_SETTINGS,
  organization: "myorg",
  project: "myproject",
});

interface Harness {
  controller: BootstrapLinkController;
  elements: BootstrapLinkElements;
  settingsStore: FakeSettingsStore;
  bindingStore: FakeBindingStore;
  teamConfigSource: FakeTeamConfigSource;
  errors: unknown[];
  writeText: ReturnType<typeof vi.fn>;
}

function setup(): Harness {
  const settingsStore = new FakeSettingsStore();
  const bindingStore = new FakeBindingStore();
  const teamConfigSource = new FakeTeamConfigSource();
  const elements: BootstrapLinkElements = {
    section: document.createElement("div"),
    link: document.createElement("a"),
    copyButton: document.createElement("button"),
    status: document.createElement("p"),
  };
  // The controller reaches the clipboard through the button's own document, so the elements have to
  // be in the page for `ownerDocument.defaultView` to be the window the fake clipboard sits on.
  document.body.append(elements.section, elements.link, elements.copyButton, elements.status);
  const writeText = vi.fn(async () => {});
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  const errors: unknown[] = [];
  const controller = new BootstrapLinkController(
    settingsStore,
    bindingStore,
    teamConfigSource,
    elements,
    (error) => errors.push(error),
  );
  controller.init();
  return { controller, elements, settingsStore, bindingStore, teamConfigSource, errors, writeText };
}

/** Supply every input the link needs, so a test only has to vary the one it is about. */
function connect(
  h: Harness,
  bindings: QueryBindings = { [QUERY_ID]: { view: "sprint", properties: {}, name: "Sprint" } },
  workItemId: number | null = 42,
): void {
  h.settingsStore.emit(settings());
  h.bindingStore.emit(bindings);
  h.teamConfigSource.emit(workItemId);
}

/** Lets the copy handler's queued microtasks settle before the status line is asserted. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.replaceChildren();
});

describe("BootstrapLinkController visibility", () => {
  it("stays hidden until a connection, a bound query, and an organization all exist", () => {
    const h = setup();

    expect(h.elements.section.hidden).toBe(true);

    h.settingsStore.emit(settings());
    h.bindingStore.emit({ [QUERY_ID]: { view: "sprint", properties: {} } });
    expect(h.elements.section.hidden).toBe(true);

    h.teamConfigSource.emit(42);
    expect(h.elements.section.hidden).toBe(false);
  });

  it("withdraws the link and its target when the connection is dropped", () => {
    const h = setup();
    connect(h);

    h.teamConfigSource.emit(null);

    expect(h.elements.section.hidden).toBe(true);
    expect(h.elements.link.hasAttribute("href")).toBe(false);
    expect(h.elements.link.textContent).toBe("");
  });

  it("withdraws the link when the last enhanced query is removed", () => {
    const h = setup();
    connect(h);

    h.bindingStore.emit({});

    expect(h.elements.section.hidden).toBe(true);
  });

  it("stays hidden while the organization and project are unknown", () => {
    const h = setup();

    h.settingsStore.emit(DEFAULT_SETTINGS);
    h.bindingStore.emit({ [QUERY_ID]: { view: "sprint", properties: {} } });
    h.teamConfigSource.emit(42);

    expect(h.elements.section.hidden).toBe(true);
  });
});

describe("BootstrapLinkController link", () => {
  it("offers the bound query's URL carrying the connected work item", () => {
    const h = setup();

    connect(h);

    const expected =
      `https://dev.azure.com/myorg/myproject/_queries/query/${QUERY_ID}` +
      `?${SHARED_CONFIG_PARAM}=42`;
    expect(h.elements.link.href).toBe(expected);
    expect(h.elements.link.textContent).toBe(expected);
    expect(h.elements.link.target).toBe("_blank");
    expect(h.elements.link.rel).toBe("noopener noreferrer");
  });

  it("names the same query every time regardless of stored key order", () => {
    const first = setup();
    connect(first, {
      [QUERY_ID]: { view: "sprint", properties: {}, name: "Zulu" },
      [OTHER_QUERY_ID]: { view: "sprint", properties: {}, name: "alpha" },
    });

    const second = setup();
    connect(second, {
      [OTHER_QUERY_ID]: { view: "sprint", properties: {}, name: "alpha" },
      [QUERY_ID]: { view: "sprint", properties: {}, name: "Zulu" },
    });

    expect(first.elements.link.href).toContain(OTHER_QUERY_ID);
    expect(second.elements.link.href).toBe(first.elements.link.href);
  });

  it("stops observing and stops rendering once disposed", () => {
    const h = setup();
    connect(h);
    const offered = h.elements.link.href;

    h.controller.dispose();
    h.teamConfigSource.emit(null);

    expect(h.settingsStore.unsubscribe).toHaveBeenCalledTimes(1);
    expect(h.bindingStore.unsubscribe).toHaveBeenCalledTimes(1);
    expect(h.teamConfigSource.unsubscribe).toHaveBeenCalledTimes(1);
    expect(h.elements.link.href).toBe(offered);
  });
});

describe("BootstrapLinkController copy", () => {
  it("copies the offered link and says so", async () => {
    const h = setup();
    connect(h);

    h.elements.copyButton.click();
    await flush();

    expect(h.writeText).toHaveBeenCalledWith(h.elements.link.textContent);
    expect(h.elements.status.textContent).toContain("Copied the bootstrap link");
    expect(h.elements.status.classList.contains("card__hint--error")).toBe(false);
    expect(h.errors).toEqual([]);
  });

  it("reports a refused clipboard write instead of leaving it silent", async () => {
    const h = setup();
    connect(h);
    h.writeText.mockRejectedValueOnce(new Error("not focused"));

    h.elements.copyButton.click();
    await flush();

    expect(h.elements.status.textContent).toContain("not focused");
    expect(h.elements.status.classList.contains("card__hint--error")).toBe(true);
    expect(h.errors).toHaveLength(1);
  });

  it("reports a copy attempted with no link to share", async () => {
    const h = setup();

    h.elements.copyButton.click();
    await flush();

    expect(h.elements.status.classList.contains("card__hint--error")).toBe(true);
    expect(h.errors).toHaveLength(1);
    expect(h.writeText).not.toHaveBeenCalled();
  });
});
