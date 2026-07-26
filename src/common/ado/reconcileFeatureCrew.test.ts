import { describe, expect, it } from "vitest";

import type { FeatureCrewUrls } from "./FeatureCrew";
import {
  buildFeatureCrewApplyConfig,
  parseFeatureCrewLookup,
  reconcileFeatureCrewRoster,
} from "./reconcileFeatureCrew";

const urls: FeatureCrewUrls = {
  wiqlUrl: "https://dev.azure.com/org/proj/_apis/wit/wiql?api-version=7.1",
  createUrl: "https://dev.azure.com/org/proj/_apis/wit/workitems/$Task?api-version=7.1",
  itemBaseUrl: "https://dev.azure.com/org/_apis/wit/workitems",
  rootRelationUrl: "https://dev.azure.com/org/_apis/wit/workItems/42",
};

describe("parseFeatureCrewLookup", () => {
  it("accepts a well-formed lookup result", () => {
    expect(
      parseFeatureCrewLookup({ id: 7, rev: 3, description: "- Ann (Ann A). `blocked`" }),
    ).toEqual({ id: 7, rev: 3, description: "- Ann (Ann A). `blocked`" });
  });

  it("defaults a missing description to empty rather than rejecting the item", () => {
    expect(parseFeatureCrewLookup({ id: 7, rev: 3 })).toEqual({ id: 7, rev: 3, description: "" });
  });

  it("rejects a non-object result", () => {
    expect(parseFeatureCrewLookup(null)).toBeNull();
    expect(parseFeatureCrewLookup(undefined)).toBeNull();
    expect(parseFeatureCrewLookup("7")).toBeNull();
    expect(parseFeatureCrewLookup(7)).toBeNull();
  });

  it("rejects an id that is not a positive integer, because it is concatenated into a request URL", () => {
    // The page world produced this value, so a string, a float, or a traversal-shaped id must never
    // reach the URL builder.
    expect(parseFeatureCrewLookup({ id: "7", rev: 1 })).toBeNull();
    expect(parseFeatureCrewLookup({ id: 7.5, rev: 1 })).toBeNull();
    expect(parseFeatureCrewLookup({ id: 0, rev: 1 })).toBeNull();
    expect(parseFeatureCrewLookup({ id: -7, rev: 1 })).toBeNull();
    expect(parseFeatureCrewLookup({ id: "../../evil", rev: 1 })).toBeNull();
  });

  it("rejects a non-finite or non-numeric rev", () => {
    expect(parseFeatureCrewLookup({ id: 7, rev: "1" })).toBeNull();
    expect(parseFeatureCrewLookup({ id: 7, rev: Number.NaN })).toBeNull();
  });
});

describe("reconcileFeatureCrewRoster", () => {
  it("seeds a roster from the assignees when no item exists yet", () => {
    const result = reconcileFeatureCrewRoster(null, {
      assignees: [{ alias: "ann", fullName: "Ann A" }],
    });

    expect(result.members.map((member) => member.alias)).toEqual(["ann"]);
    expect(result.changed).toBe(true);
    expect(result.description).toContain("ann");
  });

  it("reports no change when everyone is already on the roster and no tag moved", () => {
    const seeded = reconcileFeatureCrewRoster(null, {
      assignees: [{ alias: "ann", fullName: "Ann A" }],
    });

    const again = reconcileFeatureCrewRoster(
      { description: seeded.description },
      {
        assignees: [{ alias: "ann", fullName: "Ann A" }],
      },
    );

    // Nothing to write means the roster's hand-edited tags are left completely untouched.
    expect(again.changed).toBe(false);
    expect(again.members.map((member) => member.alias)).toEqual(["ann"]);
  });

  it("reports a change when a new person is assigned", () => {
    const seeded = reconcileFeatureCrewRoster(null, {
      assignees: [{ alias: "ann", fullName: "Ann A" }],
    });

    const grown = reconcileFeatureCrewRoster(
      { description: seeded.description },
      {
        assignees: [
          { alias: "ann", fullName: "Ann A" },
          { alias: "bob", fullName: "Bob B" },
        ],
      },
    );

    expect(grown.changed).toBe(true);
    expect(grown.members.map((member) => member.alias).sort()).toEqual(["ann", "bob"]);
  });

  it("reports a change when a tag is assigned to an existing member", () => {
    const seeded = reconcileFeatureCrewRoster(null, {
      assignees: [{ alias: "ann", fullName: "Ann A" }],
    });

    const tagged = reconcileFeatureCrewRoster(
      { description: seeded.description },
      {
        assignees: [{ alias: "ann", fullName: "Ann A" }],
        tagAssignments: [{ alias: "ann", tag: "frontend" }],
      },
    );

    expect(tagged.changed).toBe(true);
    expect(tagged.members[0]?.tag).toBe("frontend");
  });
});

describe("buildFeatureCrewApplyConfig", () => {
  it("builds a two-step create when no item was found", () => {
    const config = buildFeatureCrewApplyConfig(null, urls, "roster");

    expect(config.mode).toBe("create");
    expect(config.url).toBe(urls.createUrl);
    expect(config.rootRelationUrl).toBe(urls.rootRelationUrl);
    // The create path needs the org-level base to PATCH the item into "Removed" once it has an id.
    expect(config.itemBaseUrl).toBe(urls.itemBaseUrl);
    expect(config.description).toBe("roster");
  });

  it("builds an id-scoped update when an item was found", () => {
    const config = buildFeatureCrewApplyConfig({ id: 99 }, urls, "roster");

    expect(config).toEqual({
      mode: "update",
      url: "https://dev.azure.com/org/_apis/wit/workitems/99?api-version=7.1",
      description: "roster",
    });
  });

  it("targets the same API version as the create URL", () => {
    const config = buildFeatureCrewApplyConfig({ id: 1 }, urls, "roster");
    const version = /api-version=([\d.]+)/.exec(urls.createUrl)?.[1];

    expect(config.url).toContain(`api-version=${version}`);
  });
});
