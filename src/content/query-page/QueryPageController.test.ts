import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ILogger } from "../../common/logging/ILogger";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../common/settings/ExtensionSettings";

import type { PageBlanker } from "./PageBlanker";
import { QueryPageController } from "./QueryPageController";

function makeBlankerSpy(): PageBlanker {
  return {
    apply: vi.fn(),
  } as unknown as PageBlanker;
}

function makeLoggerSpy(): ILogger {
  return { info: vi.fn(), error: vi.fn() };
}

// The enhanced view only runs once the ADO settings are complete, so the default fixture is fully
// configured; individual tests override a single field to exercise the incomplete-config guard.
const CONFIGURED_ADO: Partial<ExtensionSettings> = {
  currentTeam: { id: "t1", name: "Platform" },
  areaPaths: [{ path: "A\\B", label: "B" }],
  boardColumns: ["Active"],
  workItemTypes: [
    { name: "Bug", color: "", icon: "", columns: [{ column: "Active", states: ["New"] }] },
  ],
};

function settings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return {
    ...DEFAULT_SETTINGS,
    theme: "auto",
    defaultView: "enhanced",
    ...CONFIGURED_ADO,
    ...overrides,
  };
}

const GUID = "12345678-1234-1234-1234-123456789abc";
const queryUrl = (id: string): string => `https://dev.azure.com/org/project/_queries/query/${id}`;

describe("QueryPageController", () => {
  let blanker: PageBlanker;
  let logger: ILogger;

  // A single wiring keeps every test's construction identical, so the injected logger spy and
  // blanker spy are always the ones the assertions inspect.
  const makeController = (url: string): QueryPageController =>
    new QueryPageController(blanker, url, logger);

  beforeEach(() => {
    blanker = makeBlankerSpy();
    logger = makeLoggerSpy();
  });

  it("does not call the blanker before settings arrive", () => {
    makeController("https://dev.azure.com/org/_queries");
    expect(blanker.apply).not.toHaveBeenCalled();
  });

  it("does not enhance an unbound query route even when defaultView is enhanced", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applySettings(settings({ defaultView: "enhanced" }));
    expect(blanker.apply).toHaveBeenCalledWith(false);
  });

  it("does not enhance when defaultView is original even on a query route", () => {
    const controller = makeController("https://dev.azure.com/org/_queries");
    controller.applySettings(settings({ defaultView: "original" }));
    expect(blanker.apply).toHaveBeenCalledWith(false);
  });

  it("does not enhance a non-query ADO route even when defaultView is enhanced", () => {
    const controller = makeController("https://dev.azure.com/org/project/_boards");
    controller.applySettings(settings({ defaultView: "enhanced" }));
    expect(blanker.apply).toHaveBeenCalledWith(false);
  });

  it("removes enhancement on navigation away from _queries", () => {
    const controller = makeController("https://dev.azure.com/org/_queries");
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.navigate("https://dev.azure.com/org/_boards");
    expect(blanker.apply).toHaveBeenCalledWith(false);
  });

  it("reapplies enhancement on navigation back to a bound query", () => {
    const controller = makeController("https://dev.azure.com/org/_boards");
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {}, active: "enhanced" } });
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.navigate(queryUrl(GUID));
    expect(blanker.apply).toHaveBeenCalledWith(true);
  });

  it("enhances a bound query on a nested route by following the enhanced default", () => {
    const controller = makeController("https://dev.azure.com/org/_boards");
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {} } });
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.navigate(queryUrl(GUID));
    expect(blanker.apply).toHaveBeenCalledWith(true);
  });

  it("navigate does nothing before settings arrive", () => {
    const controller = makeController("https://dev.azure.com/org/_boards");
    controller.navigate("https://dev.azure.com/org/_queries");
    expect(blanker.apply).not.toHaveBeenCalled();
  });

  it("applies correct value after defaultView changes from enhanced to original", () => {
    const controller = makeController("https://dev.azure.com/org/_queries");
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.applySettings(settings({ defaultView: "original" }));
    expect(blanker.apply).toHaveBeenCalledWith(false);
  });

  it("keeps a bound query enhanced when its active view is enhanced, overriding the original default", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applySettings(settings({ defaultView: "original" }));
    vi.mocked(blanker.apply).mockClear();

    controller.applyBindings({ [GUID]: { view: "sprint", properties: {}, active: "enhanced" } });
    expect(blanker.apply).toHaveBeenLastCalledWith(true);
  });

  it("drops a bound query to standard even when the global default is enhanced", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.applyBindings({ [GUID]: { view: "sprint", properties: {}, active: "standard" } });
    expect(blanker.apply).toHaveBeenLastCalledWith(false);
  });

  it("does not enhance a bound query while the ADO settings are incomplete", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {}, active: "enhanced" } });

    // Clearing the work item types makes the config incomplete, so even an explicit enhanced binding
    // stays on ADO's own page.
    controller.applySettings(settings({ defaultView: "enhanced", workItemTypes: [] }));
    expect(blanker.apply).toHaveBeenLastCalledWith(false);
  });

  it("does not enhance an unbound query even when the default is enhanced", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.applyBindings({});
    expect(blanker.apply).toHaveBeenLastCalledWith(false);
  });

  it("never blanks a non-query route regardless of bindings", () => {
    const controller = makeController("https://dev.azure.com/org/project/_boards");
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(blanker.apply).mockClear();

    controller.applyBindings({ [GUID]: { view: "sprint", properties: {}, active: "enhanced" } });
    expect(blanker.apply).toHaveBeenLastCalledWith(false);
  });

  it("applyBindings does nothing before settings arrive", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {}, active: "enhanced" } });
    expect(blanker.apply).not.toHaveBeenCalled();
  });

  it("logs the enhance decision with its reason and signals only when it flips", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {}, active: "enhanced" } });
    controller.applySettings(settings({ defaultView: "enhanced" }));

    // First decision (enhance) is logged with the reason and the signals that drove it.
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.info).mock.calls[0]?.[0]).toContain("Query page enhanced");
    expect(vi.mocked(logger.info).mock.calls[0]?.[0]).toContain("reason=bound-view-active");

    // A refresh that reaches the same conclusion must not re-log, so the bounded ring buffer is not
    // flooded by the many settings/bindings/navigation events that trigger a refresh.
    controller.applySettings(settings({ defaultView: "enhanced" }));
    expect(logger.info).toHaveBeenCalledTimes(1);

    // Flipping the conclusion logs again, this time recording why it is no longer enhanced.
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {}, active: "standard" } });
    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(vi.mocked(logger.info).mock.calls[1]?.[0]).toContain("reason=bound-standard-active");
  });
});
