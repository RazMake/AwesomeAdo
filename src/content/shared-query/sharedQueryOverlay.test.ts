import { describe, expect, it } from "vitest";

import type { QueryBindings } from "../../common/bindings/QueryBinding";
import { DEFAULT_SETTINGS } from "../../common/settings/ExtensionSettings";

import type { SharedQueryConfiguration } from "./SharedQueryController";
import { overlayBindings, overlaySettings } from "./sharedQueryOverlay";

const QUERY_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";

const shared = (overrides: Partial<SharedQueryConfiguration> = {}): SharedQueryConfiguration => ({
  queryId: QUERY_ID,
  workItemId: 42,
  settings: {},
  binding: { view: "sprint", properties: { order: "eta" } },
  ...overrides,
});

describe("overlaySettings", () => {
  it("leaves the reader's own settings alone when no query is shared", () => {
    const local = { ...DEFAULT_SETTINGS, theme: "dark" as const };

    expect(overlaySettings(local, null)).toBe(local);
  });

  it("lets the publisher's values govern the shared query's page", () => {
    const local = { ...DEFAULT_SETTINGS, theme: "dark" as const, project: "Mine" };

    const result = overlaySettings(local, shared({ settings: { project: "Theirs" } }));

    expect(result.project).toBe("Theirs");
  });

  it("keeps the reader's value for anything the publisher did not describe", () => {
    // A payload only carries the settings it described usably; everything else still needs an
    // answer, and the reader's own is the only one available.
    const local = { ...DEFAULT_SETTINGS, theme: "dark" as const };

    expect(overlaySettings(local, shared({ settings: { project: "Theirs" } })).theme).toBe("dark");
  });

  it("normalizes the result, so a published value can never reach a view malformed", () => {
    const result = overlaySettings(
      DEFAULT_SETTINGS,
      shared({ settings: { futureSprintsCount: 999 } }),
    );

    expect(result.futureSprintsCount).toBeLessThanOrEqual(12);
  });
});

describe("overlayBindings", () => {
  const local: QueryBindings = {
    [QUERY_ID]: { view: "project-tracking", properties: {} },
    [OTHER_ID]: { view: "sprint", properties: {} },
  };

  it("returns the reader's own bindings untouched when no query is shared", () => {
    expect(overlayBindings(local, null)).toBe(local);
  });

  it("substitutes only the shared query's binding", () => {
    const result = overlayBindings(local, shared());

    expect(result[QUERY_ID]).toEqual({ view: "sprint", properties: { order: "eta" } });
    // Opening someone else's query must never change what the reader's own queries do.
    expect(result[OTHER_ID]).toEqual(local[OTHER_ID]);
  });

  it("adds a binding for a shared query the reader has none of", () => {
    const result = overlayBindings({}, shared());

    expect(result[QUERY_ID]).toEqual({ view: "sprint", properties: { order: "eta" } });
  });

  it("removes the query when the publisher does not enhance it", () => {
    const result = overlayBindings(local, shared({ binding: null }));

    expect(result[QUERY_ID]).toBeUndefined();
    expect(result[OTHER_ID]).toBeDefined();
  });

  it("never mutates the map it was given", () => {
    overlayBindings(local, shared({ binding: null }));

    expect(local[QUERY_ID]).toBeDefined();
  });
});
