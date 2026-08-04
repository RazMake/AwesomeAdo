import { describe, expect, it } from "vitest";

import {
  buildCreateQueryUrl,
  buildDeleteQueryUrl,
  buildDeleteQueryUrlParts,
  buildProjectQueryWiql,
  buildQueryWebUrl,
  buildQueryWebUrlPrefix,
  DEFAULT_QUERY_FOLDER,
  HYPERLINK_RELATION,
  parseCreatedQuery,
  parseProjectQueryLinks,
  projectQueryName,
  PROJECT_QUERY_LINK_COMMENT,
  uniqueProjectQueryName,
} from "./projectQuery";

const QUERY_URL = "https://dev.azure.com/contoso/Fabrikam/_queries/query/abc";
const QUERY_GUID = "11111111-2222-3333-4444-555555555555";
const OTHER_GUID = "99999999-8888-7777-6666-555555555555";
const LINK_URL = `https://dev.azure.com/contoso/Fabrikam/_queries/query/${QUERY_GUID}`;
const OTHER_LINK_URL = `https://dev.azure.com/contoso/Fabrikam/_queries/query/${OTHER_GUID}`;

/** One expanded work item as `workitemsbatch` returns it. */
function expanded(id: number, relations: unknown[]): unknown {
  return { id, rev: 4, relations };
}

/** The hyperlink shape this extension writes. */
function trackingLink(url = LINK_URL): unknown {
  return {
    rel: HYPERLINK_RELATION,
    url,
    attributes: { comment: PROJECT_QUERY_LINK_COMMENT },
  };
}

/** The hyperlink shape Azure DevOps' own "link to a saved query" writes. */
function savedQueryLink(url = OTHER_LINK_URL): unknown {
  return { rel: HYPERLINK_RELATION, url, attributes: { comment: "Saved query: Payments" } };
}

describe("buildProjectQueryWiql", () => {
  it("asks for the project and everything beneath it, recursively", () => {
    const wiql = buildProjectQueryWiql(42);
    expect(wiql).toContain("FROM workitemLinks");
    expect(wiql).toContain("[Source].[System.Id] = 42");
    expect(wiql).toContain("System.LinkTypes.Hierarchy-Forward");
    expect(wiql).toContain("MODE (Recursive)");
  });

  it("pins both ends to the project the saved query lives in", () => {
    const wiql = buildProjectQueryWiql(42);
    // The macro, never a literal name: a name resolved anywhere else could point at a project this
    // query was not saved in, and would silently return nothing.
    expect(wiql).toContain("[Source].[System.TeamProject] = @project");
    expect(wiql).toContain("[Target].[System.TeamProject] = @project");
  });

  it("keeps deleted work out of the tree and orders it by assignee", () => {
    const wiql = buildProjectQueryWiql(42);
    expect(wiql).toContain("NOT [Target].[System.State] IN ('Removed')");
    expect(wiql).toContain("ORDER BY [System.AssignedTo] DESC");
    // MODE must close the statement, or Azure DevOps refuses the WIQL outright.
    expect(wiql.trimEnd().endsWith("MODE (Recursive)")).toBe(true);
  });
});

describe("projectQueryName", () => {
  it("keeps a name Azure DevOps already accepts", () => {
    expect(projectQueryName("Payments platform")).toBe("Payments platform");
  });

  it("replaces the characters Azure DevOps refuses instead of failing the command", () => {
    expect(projectQueryName("Billing / Invoicing: v2")).toBe("Billing - Invoicing- v2");
  });

  it("drops a trailing period, which ADO refuses even after the illegal characters are gone", () => {
    expect(projectQueryName("Migrate the API...")).toBe("Migrate the API");
  });

  it("falls back to a usable name when the title reduces to nothing", () => {
    expect(projectQueryName("   ")).toBe("Project");
  });

  it("distinguishes a duplicate by the one thing guaranteed to differ", () => {
    expect(uniqueProjectQueryName("Payments", 42)).toBe("Payments (#42)");
  });
});

describe("query URL builders", () => {
  it("creates inside the named folder, keeping its separators literal", () => {
    expect(buildCreateQueryUrl(QUERY_URL, "Shared Queries/Team A")).toBe(
      "https://dev.azure.com/contoso/Fabrikam/_apis/wit/queries/Shared%20Queries/Team%20A?api-version=7.1",
    );
  });

  it("falls back to the shared root when no folder is named", () => {
    expect(buildCreateQueryUrl(QUERY_URL, "  ")).toContain(
      encodeURIComponent(DEFAULT_QUERY_FOLDER),
    );
  });

  it("joins the delete endpoint from the same halves the page world is handed", () => {
    const parts = buildDeleteQueryUrlParts(QUERY_URL);
    expect(buildDeleteQueryUrl(QUERY_URL, QUERY_GUID)).toBe(
      `${parts?.prefix}${QUERY_GUID}${parts?.suffix}`,
    );
  });

  it("joins the web URL from the same prefix the page world is handed", () => {
    expect(buildQueryWebUrl(QUERY_URL, QUERY_GUID)).toBe(
      `${buildQueryWebUrlPrefix(QUERY_URL)}${QUERY_GUID}`,
    );
  });

  it("refuses every builder on a page that names no ADO project", () => {
    expect(buildCreateQueryUrl("https://example.com/", "Shared Queries")).toBeNull();
    expect(buildDeleteQueryUrl("https://example.com/", QUERY_GUID)).toBeNull();
    expect(buildDeleteQueryUrlParts("https://example.com/")).toBeNull();
    expect(buildQueryWebUrl("https://example.com/", QUERY_GUID)).toBeNull();
    expect(buildQueryWebUrlPrefix("https://example.com/")).toBeNull();
  });

  it("refuses a blank query id rather than addressing the collection", () => {
    expect(buildDeleteQueryUrl(QUERY_URL, " ")).toBeNull();
    expect(buildQueryWebUrl(QUERY_URL, " ")).toBeNull();
  });
});

describe("parseCreatedQuery", () => {
  it("reads the id Azure DevOps assigned, normalized to one casing", () => {
    expect(parseCreatedQuery({ id: QUERY_GUID.toUpperCase(), name: "Payments" })).toEqual({
      id: QUERY_GUID,
      name: "Payments",
    });
  });

  it("answers null when the body carries no usable id", () => {
    expect(parseCreatedQuery({ name: "Payments" })).toBeNull();
    expect(parseCreatedQuery(null)).toBeNull();
    expect(parseCreatedQuery({ id: "  " })).toBeNull();
  });

  it("tolerates a missing name rather than refusing the created query", () => {
    expect(parseCreatedQuery({ id: QUERY_GUID })).toEqual({ id: QUERY_GUID, name: "" });
  });
});

describe("parseProjectQueryLinks", () => {
  it("reports the tracking query each project owns, and that this extension made it", () => {
    expect(parseProjectQueryLinks({ value: [expanded(1, [trackingLink()])] })).toEqual([
      { workItemId: 1, queryId: QUERY_GUID, url: LINK_URL, managed: true },
    ]);
  });

  it("accepts a bare array as well as a wrapped collection", () => {
    expect(parseProjectQueryLinks([expanded(1, [trackingLink()])])).toHaveLength(1);
  });

  it("reports a lone query link added outside this extension, marked as not ours to delete", () => {
    // Exactly what Azure DevOps' own "link to a saved query" writes; refusing it reported every
    // project that already had a tracking query as having none.
    const byHand = {
      rel: HYPERLINK_RELATION,
      url: LINK_URL,
      attributes: { comment: "Saved query: Payments" },
    };
    expect(parseProjectQueryLinks({ value: [expanded(1, [byHand])] })).toEqual([
      { workItemId: 1, queryId: QUERY_GUID, url: LINK_URL, managed: false },
    ]);
  });

  it("reports a lone query hyperlink carrying no comment at all", () => {
    const bare = { rel: HYPERLINK_RELATION, url: LINK_URL };
    expect(parseProjectQueryLinks({ value: [expanded(1, [bare])] })).toEqual([
      { workItemId: 1, queryId: QUERY_GUID, url: LINK_URL, managed: false },
    ]);
  });

  it("prefers this extension's own link over one somebody else added", () => {
    expect(
      parseProjectQueryLinks({ value: [expanded(1, [savedQueryLink(), trackingLink()])] }),
    ).toEqual([{ workItemId: 1, queryId: QUERY_GUID, url: LINK_URL, managed: true }]);
  });

  it("names none when several unstamped links each point at a query", () => {
    const second = savedQueryLink(LINK_URL);
    expect(parseProjectQueryLinks({ value: [expanded(1, [savedQueryLink(), second])] })).toEqual(
      [],
    );
  });

  it("keeps the link's own address, which may name another project's query", () => {
    const elsewhere = `https://dev.azure.com/contoso/Contoso%20Core/_queries/query/${QUERY_GUID}/`;
    expect(parseProjectQueryLinks({ value: [expanded(1, [trackingLink(elsewhere)])] })).toEqual([
      { workItemId: 1, queryId: QUERY_GUID, url: elsewhere, managed: true },
    ]);
  });

  it("ignores a link whose URL names no single query", () => {
    const folder = trackingLink("https://dev.azure.com/contoso/Fabrikam/_queries/folder/?path=x");
    expect(parseProjectQueryLinks({ value: [expanded(1, [folder])] })).toEqual([]);
  });

  it("ignores a relation that is not a hyperlink at all", () => {
    const parent = { rel: "System.LinkTypes.Hierarchy-Reverse", url: LINK_URL };
    expect(parseProjectQueryLinks({ value: [expanded(1, [parent])] })).toEqual([]);
  });

  it("skips items with no relations, and bodies that are not a collection", () => {
    expect(parseProjectQueryLinks({ value: [{ id: 1 }] })).toEqual([]);
    expect(parseProjectQueryLinks({ value: [expanded(1, [])] })).toEqual([]);
    expect(parseProjectQueryLinks({ value: [null, 7] })).toEqual([]);
    expect(parseProjectQueryLinks(null)).toEqual([]);
  });
});
