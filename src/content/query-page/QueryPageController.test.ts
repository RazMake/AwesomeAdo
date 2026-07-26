import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ILogger } from "../../common/logging/ILogger";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../common/settings/ExtensionSettings";
import { SessionActiveViewOverrides } from "../active-view/SessionActiveViewOverrides";

import type { EnhancedViewSurface } from "./EnhancedViewSurface";
import { QueryPageController } from "./QueryPageController";

function makeSurfaceSpy(): EnhancedViewSurface {
  return {
    apply: vi.fn(),
    applyTheme: vi.fn(),
  } as unknown as EnhancedViewSurface;
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
// The request a bound Sprint query resolves to, so enhanced expectations stay in one place.
const sprintRequest = (id: string): unknown => ({ viewId: "sprint", queryId: id, properties: {} });

// Shared across the sibling describes below so each split group reuses one wiring with zero
// duplication (jscpd threshold is 0).
let surface: EnhancedViewSurface;
let logger: ILogger;
// The in-session view override the controller reads to resolve a bound query's presentation. The
// real implementation is used so a test's `set` is seen by the controller exactly as in production.
let overrides: SessionActiveViewOverrides;

// A single wiring keeps every test's construction identical, so the injected logger spy and
// surface spy are always the ones the assertions inspect.
const makeController = (url: string): QueryPageController =>
  new QueryPageController(surface, url, overrides, logger);

beforeEach(() => {
  surface = makeSurfaceSpy();
  logger = makeLoggerSpy();
  overrides = new SessionActiveViewOverrides();
});

describe("QueryPageController - routing", () => {
  it("does not call the surface before settings arrive", () => {
    makeController("https://dev.azure.com/org/_queries");
    expect(surface.apply).not.toHaveBeenCalled();
  });

  it("forwards the chosen theme to the surface on every settings change", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applySettings(settings({ theme: "blue" }));
    expect(surface.applyTheme).toHaveBeenCalledWith("blue");
    controller.applySettings(settings({ theme: "dark" }));
    expect(surface.applyTheme).toHaveBeenLastCalledWith("dark");
  });

  it("does not enhance an unbound query route even when defaultView is enhanced", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applySettings(settings({ defaultView: "enhanced" }));
    expect(surface.apply).toHaveBeenCalledWith(null);
  });

  it("does not enhance when defaultView is original even on a query route", () => {
    const controller = makeController("https://dev.azure.com/org/_queries");
    controller.applySettings(settings({ defaultView: "original" }));
    expect(surface.apply).toHaveBeenCalledWith(null);
  });

  it("does not enhance a non-query ADO route even when defaultView is enhanced", () => {
    const controller = makeController("https://dev.azure.com/org/project/_boards");
    controller.applySettings(settings({ defaultView: "enhanced" }));
    expect(surface.apply).toHaveBeenCalledWith(null);
  });

  it("removes enhancement on navigation away from _queries", () => {
    const controller = makeController("https://dev.azure.com/org/_queries");
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(surface.apply).mockClear();

    controller.navigate("https://dev.azure.com/org/_boards");
    expect(surface.apply).toHaveBeenCalledWith(null);
  });

  it("requests the bound view on navigation back to a bound query", () => {
    const controller = makeController("https://dev.azure.com/org/_boards");
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {} } });
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(surface.apply).mockClear();

    controller.navigate(queryUrl(GUID));
    expect(surface.apply).toHaveBeenCalledWith(sprintRequest(GUID));
  });

  it("enhances a bound query on a nested route by following the enhanced default", () => {
    const controller = makeController("https://dev.azure.com/org/_boards");
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {} } });
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(surface.apply).mockClear();

    controller.navigate(queryUrl(GUID));
    expect(surface.apply).toHaveBeenCalledWith(sprintRequest(GUID));
  });

  it("passes the binding's view id and per-query properties through to the surface", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applySettings(settings({ defaultView: "enhanced" }));
    controller.applyBindings({
      [GUID]: { view: "projectTracking", properties: { weeks: "3" } },
    });

    expect(surface.apply).toHaveBeenLastCalledWith({
      viewId: "projectTracking",
      queryId: GUID,
      properties: { weeks: "3" },
    });
  });

  it("navigate does nothing before settings arrive", () => {
    const controller = makeController("https://dev.azure.com/org/_boards");
    controller.navigate("https://dev.azure.com/org/_queries");
    expect(surface.apply).not.toHaveBeenCalled();
  });
});

describe("QueryPageController - session overrides", () => {
  it("restores ADO after defaultView changes from enhanced to original", () => {
    const controller = makeController("https://dev.azure.com/org/_queries");
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(surface.apply).mockClear();

    controller.applySettings(settings({ defaultView: "original" }));
    expect(surface.apply).toHaveBeenCalledWith(null);
  });

  it("keeps a bound query enhanced when its session override is enhanced, overriding the original default", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applySettings(settings({ defaultView: "original" }));
    vi.mocked(surface.apply).mockClear();

    // The user flipped this query to its enhanced view for the session; that wins over the original
    // global default without persisting anything.
    overrides.set(GUID, "enhanced");
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {} } });
    expect(surface.apply).toHaveBeenLastCalledWith(sprintRequest(GUID));
  });

  it("drops a bound query to standard when the session override is standard even if the default is enhanced", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(surface.apply).mockClear();

    overrides.set(GUID, "standard");
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {} } });
    expect(surface.apply).toHaveBeenLastCalledWith(null);
  });

  it("does not enhance a bound query while the ADO settings are incomplete", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {} } });

    // Clearing the work item types makes the config incomplete, so even the enhanced default leaves
    // the query on ADO's own page.
    controller.applySettings(settings({ defaultView: "enhanced", workItemTypes: [] }));
    expect(surface.apply).toHaveBeenLastCalledWith(null);
  });

  it("does not enhance an unbound query even when the default is enhanced", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(surface.apply).mockClear();

    controller.applyBindings({});
    expect(surface.apply).toHaveBeenLastCalledWith(null);
  });

  it("never enhances a non-query route regardless of bindings", () => {
    const controller = makeController("https://dev.azure.com/org/project/_boards");
    controller.applySettings(settings({ defaultView: "enhanced" }));
    vi.mocked(surface.apply).mockClear();

    controller.applyBindings({ [GUID]: { view: "sprint", properties: {} } });
    expect(surface.apply).toHaveBeenLastCalledWith(null);
  });

  it("applyBindings does nothing before settings arrive", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {} } });
    expect(surface.apply).not.toHaveBeenCalled();
  });
});

describe("QueryPageController - decision logging", () => {
  it("logs the enhance decision with its reason, view, and signals only when it changes", () => {
    const controller = makeController(queryUrl(GUID));
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {} } });
    controller.applySettings(settings({ defaultView: "enhanced" }));

    // First decision (enhance) is logged with the reason, the view, and the signals that drove it.
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.info).mock.calls[0]?.[0]).toContain("enhanced with view sprint");
    expect(vi.mocked(logger.info).mock.calls[0]?.[0]).toContain("reason=bound-view-active");

    // A refresh that reaches the same conclusion must not re-log, so the bounded ring buffer is not
    // flooded by the many settings/bindings/navigation events that trigger a refresh.
    controller.applySettings(settings({ defaultView: "enhanced" }));
    expect(logger.info).toHaveBeenCalledTimes(1);

    // The user switches this query to ADO's standard page for the session: a flipped conclusion,
    // logged again with why it is no longer enhanced.
    overrides.set(GUID, "standard");
    controller.applyActiveViewOverride();
    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(vi.mocked(logger.info).mock.calls[1]?.[0]).toContain("reason=bound-standard-active");
  });

  it("re-logs when the enhanced view id changes even though it stays enhanced", () => {
    const controller = makeController(queryUrl(GUID));
    // Bindings before settings: the first refresh (once settings arrive) concludes enhanced:sprint,
    // so there is no earlier "left on ADO" log to account for.
    controller.applyBindings({ [GUID]: { view: "sprint", properties: {} } });
    controller.applySettings(settings({ defaultView: "enhanced" }));
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.info).mock.calls[0]?.[0]).toContain("enhanced with view sprint");

    // Rebinding the same query to a different view is a new conclusion, so it logs again.
    controller.applyBindings({
      [GUID]: { view: "projectTracking", properties: {} },
    });
    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(vi.mocked(logger.info).mock.calls[1]?.[0]).toContain(
      "enhanced with view projectTracking",
    );
  });
});
