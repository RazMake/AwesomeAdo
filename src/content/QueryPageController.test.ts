import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS, type ExtensionSettings } from "../common/settings/ExtensionSettings";

import type { PageBlanker } from "./PageBlanker";
import { QueryPageController } from "./QueryPageController";

function makeBlankerSpy(): PageBlanker {
  return {
    apply: vi.fn(),
  } as unknown as PageBlanker;
}

function settings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, theme: "auto", defaultView: "enhanced", ...overrides };
}

const GUID = "12345678-1234-1234-1234-123456789abc";
const queryUrl = (id: string): string => `https://dev.azure.com/org/project/_queries/query/${id}`;

describe("QueryPageController", () => {
  let blanker: PageBlanker;

  beforeEach(() => {
    blanker = makeBlankerSpy();
  });

  it("does not call the blanker before settings arrive", () => {
    new QueryPageController(blanker, "https://dev.azure.com/org/_queries");
    expect(blanker.apply).not.toHaveBeenCalled();
  });

  it("does not enhance an unbound query route even when defaultView is enhanced", () => {
    const controller = new QueryPageController(blanker, queryUrl(GUID));
    controller.applySettings(settings({ defaultView: "enhanced" }));
    expect(blanker.apply).toHaveBeenCalledWith(false);
  });

  it("does not enhance when defaultView is original even on a query route", () => {
    const controller = new QueryPageController(blanker, "https://dev.azure.com/org/_queries");
    controller.applySettings(settings({ defaultView: "original" }));
    expect(blanker.apply).toHaveBeenCalledWith(false);
  });

  it("does not enhance a non-query ADO route even when defaultView is enhanced", () => {
    const controller = new QueryPageController(
      blanker,
      "https://dev.azure.com/org/project/_boards",
    );
    controller.applySettings(settings({ defaultView: "enhanced" }));
    expect(blanker.apply).toHaveBeenCalledWith(false);
  });

  it("removes enhancement on navigation away from _queries", () => {
    const controller = new QueryPageController(blanker, "https://dev.azure.com/org/_queries");
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.navigate("https://dev.azure.com/org/_boards");
    expect(blanker.apply).toHaveBeenCalledWith(false);
  });

  it("reapplies enhancement on navigation back to a bound query", () => {
    const controller = new QueryPageController(blanker, "https://dev.azure.com/org/_boards");
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {}, active: "enhanced" } });
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.navigate(queryUrl(GUID));
    expect(blanker.apply).toHaveBeenCalledWith(true);
  });

  it("enhances a bound query on a nested route by following the enhanced default", () => {
    const controller = new QueryPageController(blanker, "https://dev.azure.com/org/_boards");
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {} } });
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.navigate(queryUrl(GUID));
    expect(blanker.apply).toHaveBeenCalledWith(true);
  });

  it("navigate does nothing before settings arrive", () => {
    const controller = new QueryPageController(blanker, "https://dev.azure.com/org/_boards");
    controller.navigate("https://dev.azure.com/org/_queries");
    expect(blanker.apply).not.toHaveBeenCalled();
  });

  it("applies correct value after defaultView changes from enhanced to original", () => {
    const controller = new QueryPageController(blanker, "https://dev.azure.com/org/_queries");
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.applySettings(settings({ defaultView: "original" }));
    expect(blanker.apply).toHaveBeenCalledWith(false);
  });

  it("keeps a bound query enhanced when its active view is enhanced, overriding the original default", () => {
    const controller = new QueryPageController(blanker, queryUrl(GUID));
    controller.applySettings(settings({ defaultView: "original" }));
    vi.mocked(blanker.apply).mockClear();

    controller.applyBindings({ [GUID]: { view: "sprint", properties: {}, active: "enhanced" } });
    expect(blanker.apply).toHaveBeenLastCalledWith(true);
  });

  it("drops a bound query to standard even when the global default is enhanced", () => {
    const controller = new QueryPageController(blanker, queryUrl(GUID));
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.applyBindings({ [GUID]: { view: "sprint", properties: {}, active: "standard" } });
    expect(blanker.apply).toHaveBeenLastCalledWith(false);
  });

  it("does not enhance an unbound query even when the default is enhanced", () => {
    const controller = new QueryPageController(blanker, queryUrl(GUID));
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.applyBindings({});
    expect(blanker.apply).toHaveBeenLastCalledWith(false);
  });

  it("never blanks a non-query route regardless of bindings", () => {
    const controller = new QueryPageController(
      blanker,
      "https://dev.azure.com/org/project/_boards",
    );
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.applyBindings({ [GUID]: { view: "sprint", properties: {}, active: "enhanced" } });
    expect(blanker.apply).toHaveBeenLastCalledWith(false);
  });

  it("applyBindings does nothing before settings arrive", () => {
    const controller = new QueryPageController(blanker, queryUrl(GUID));
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {}, active: "enhanced" } });
    expect(blanker.apply).not.toHaveBeenCalled();
  });
});
