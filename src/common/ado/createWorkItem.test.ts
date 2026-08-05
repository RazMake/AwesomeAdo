import { describe, expect, it } from "vitest";

import {
  buildCreateWorkItemPatch,
  buildCreateWorkItemUrl,
  buildParentLinkUrl,
  parseCreatedWorkItem,
} from "./createWorkItem";

const QUERY_URL = "https://dev.azure.com/contoso/Fabrikam/_queries/query/abc";

describe("buildCreateWorkItemUrl", () => {
  it("targets the project's create endpoint with the type's `$` marker encoded", () => {
    expect(buildCreateWorkItemUrl(QUERY_URL, "Epic")).toBe(
      "https://dev.azure.com/contoso/Fabrikam/_apis/wit/workitems/%24Epic?api-version=7.1",
    );
  });

  it("encodes a type whose name would otherwise change the URL's shape", () => {
    expect(buildCreateWorkItemUrl(QUERY_URL, "Product Backlog Item")).toContain(
      "%24Product%20Backlog%20Item",
    );
  });

  it("refuses a page that names no ADO project, and a blank type", () => {
    expect(buildCreateWorkItemUrl("https://example.com/", "Epic")).toBeNull();
    expect(buildCreateWorkItemUrl(QUERY_URL, "   ")).toBeNull();
  });
});

describe("buildParentLinkUrl", () => {
  it("addresses the parent at the organization, which is where a relation points", () => {
    expect(buildParentLinkUrl(QUERY_URL, 42)).toBe(
      "https://dev.azure.com/contoso/_apis/wit/workItems/42",
    );
  });

  it("refuses a page that names no ADO project", () => {
    expect(buildParentLinkUrl("https://example.com/", 42)).toBeNull();
  });
});

describe("buildCreateWorkItemPatch", () => {
  it("gives the item its title, tags, area path, and iteration path in ONE document", () => {
    expect(
      buildCreateWorkItemPatch({
        type: "Epic",
        title: "Payments",
        tags: ["Catalog", "Platform"],
        areaPath: "Fabrikam\\Core",
        iterationPath: "Fabrikam\\Backlog",
      }),
    ).toEqual([
      { op: "add", path: "/fields/System.Title", value: "Payments" },
      { op: "add", path: "/fields/System.Tags", value: "Catalog; Platform" },
      { op: "add", path: "/fields/System.AreaPath", value: "Fabrikam\\Core" },
      {
        op: "add",
        path: "/fields/System.IterationPath",
        value: "Fabrikam\\Backlog",
      },
    ]);
  });

  it("omits tags and classification paths rather than writing empty ones", () => {
    expect(
      buildCreateWorkItemPatch({
        type: "Epic",
        title: "Payments",
        tags: [],
        areaPath: null,
        iterationPath: null,
      }),
    ).toEqual([{ op: "add", path: "/fields/System.Title", value: "Payments" }]);
  });

  it("parents the item in the same document, so it is never briefly an orphan", () => {
    const patch = buildCreateWorkItemPatch(
      { type: "Feature", title: "Phase 1", tags: [], areaPath: null, iterationPath: null },
      "https://dev.azure.com/contoso/_apis/wit/workItems/7",
    );

    expect(patch).toContainEqual({
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: "https://dev.azure.com/contoso/_apis/wit/workItems/7",
      },
    });
  });

  it("adds no relation when there is no parent to link to", () => {
    const unparented = { type: "Epic", title: "Payments", tags: [], areaPath: null } as const;

    expect(buildCreateWorkItemPatch({ ...unparented, iterationPath: null })).toHaveLength(1);
    expect(buildCreateWorkItemPatch({ ...unparented, iterationPath: null }, null)).toHaveLength(1);
  });

  it("treats whitespace-only classification paths as absent", () => {
    const patch = buildCreateWorkItemPatch({
      type: "Epic",
      title: "Payments",
      tags: [],
      areaPath: "   ",
      iterationPath: "   ",
    });
    expect(patch).toHaveLength(1);
  });
});

describe("buildCreateWorkItemPatch - what a form filled in", () => {
  it("writes the assignee, the description and the reason in the SAME document", () => {
    const patch = buildCreateWorkItemPatch({
      type: "Story",
      title: "Card capture",
      tags: [],
      areaPath: null,
      iterationPath: null,
      assignedTo: "ada@example.com",
      description: "Retry **fails**.",
      comment: "[Accepted] Customer escalation.",
    });

    expect(patch).toEqual([
      { op: "add", path: "/fields/System.Title", value: "Card capture" },
      { op: "add", path: "/fields/System.AssignedTo", value: "ada@example.com" },
      { op: "add", path: "/fields/System.Description", value: "Retry **fails**." },
      { op: "add", path: "/multilineFieldsFormat/System.Description", value: "Markdown" },
      { op: "add", path: "/fields/System.History", value: "[Accepted] Customer escalation." },
      { op: "add", path: "/multilineFieldsFormat/System.History", value: "Markdown" },
    ]);
  });

  it("omits prose nobody wrote rather than storing an empty field in Markdown", () => {
    const patch = buildCreateWorkItemPatch({
      type: "Story",
      title: "Card capture",
      tags: [],
      areaPath: null,
      iterationPath: null,
      assignedTo: null,
      description: "   ",
      comment: null,
    });

    expect(patch).toEqual([{ op: "add", path: "/fields/System.Title", value: "Card capture" }]);
  });
});

describe("parseCreatedWorkItem", () => {
  it("reads the id and revision Azure DevOps assigned", () => {
    expect(parseCreatedWorkItem({ id: 42, rev: 3 })).toEqual({ id: 42, rev: 3, fields: {} });
  });

  it("carries back the fields the process defaulted, which nobody asked for", () => {
    const body = { id: 42, rev: 1, fields: { "System.State": "New", "Custom.Priority": 2 } };

    expect(parseCreatedWorkItem(body)?.fields).toEqual({
      "System.State": "New",
      "Custom.Priority": 2,
    });
  });

  it("assumes the first revision when the body reports none", () => {
    expect(parseCreatedWorkItem({ id: 42 })).toEqual({ id: 42, rev: 1, fields: {} });
  });

  it("treats a missing or malformed field bag as no fields at all", () => {
    expect(parseCreatedWorkItem({ id: 42, fields: "nope" })?.fields).toEqual({});
    expect(parseCreatedWorkItem({ id: 42, fields: null })?.fields).toEqual({});
  });

  it("answers null when the body carries no usable id", () => {
    expect(parseCreatedWorkItem({ id: "42" })).toBeNull();
    expect(parseCreatedWorkItem(null)).toBeNull();
    expect(parseCreatedWorkItem({ id: Number.NaN })).toBeNull();
  });
});
