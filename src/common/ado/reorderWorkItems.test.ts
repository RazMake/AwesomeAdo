import { describe, expect, it } from "vitest";

import {
  buildWorkItemLinkUrl,
  buildWorkItemRelationsUrl,
  buildWorkItemsOrderUrl,
  parseReorderedRank,
  PARENT_LINK_TYPE,
  WORK_ITEMS_ORDER_API_VERSION,
} from "./reorderWorkItems";

const PROJECT_HREF = "https://dev.azure.com/contoso/web/_queries/query/abc";
const LEGACY_HREF = "https://contoso.visualstudio.com/web/_queries/query/abc";

describe("reorderWorkItems - constants", () => {
  it("pins the order endpoint to the preview api-version it is only served under", () => {
    expect(WORK_ITEMS_ORDER_API_VERSION).toBe("7.1-preview.1");
  });

  it("names ADO's child→parent hierarchy link type", () => {
    expect(PARENT_LINK_TYPE).toBe("System.LinkTypes.Hierarchy-Reverse");
  });
});

describe("buildWorkItemsOrderUrl", () => {
  it("builds the team-scoped order URL for a dev.azure.com project", () => {
    expect(buildWorkItemsOrderUrl(PROJECT_HREF, "Web")).toBe(
      "https://dev.azure.com/contoso/web/Web/_apis/work/workitemsorder?api-version=7.1-preview.1",
    );
  });

  it("uses the origin as the base for a visualstudio.com project", () => {
    expect(buildWorkItemsOrderUrl(LEGACY_HREF, "Web")).toBe(
      "https://contoso.visualstudio.com/web/Web/_apis/work/workitemsorder?api-version=7.1-preview.1",
    );
  });

  it("URL-encodes the team name", () => {
    expect(buildWorkItemsOrderUrl(PROJECT_HREF, "Web Team/A&B")).toBe(
      "https://dev.azure.com/contoso/web/Web%20Team%2FA%26B/_apis/work/workitemsorder?api-version=7.1-preview.1",
    );
  });

  it("carries the preview api-version rather than the shared stable one", () => {
    const url = buildWorkItemsOrderUrl(PROJECT_HREF, "Web");

    expect(url?.endsWith(`?api-version=${WORK_ITEMS_ORDER_API_VERSION}`)).toBe(true);
    expect(url).not.toContain("api-version=7.1&");
  });

  it("returns null when the team is blank", () => {
    expect(buildWorkItemsOrderUrl(PROJECT_HREF, "")).toBeNull();
  });

  it("returns null when the team is only whitespace", () => {
    expect(buildWorkItemsOrderUrl(PROJECT_HREF, "   ")).toBeNull();
  });

  it("returns null for an org-level ADO URL that names no project", () => {
    expect(buildWorkItemsOrderUrl("https://dev.azure.com/contoso/_queries", "Web")).toBeNull();
  });

  it("returns null for a non-ADO URL", () => {
    expect(buildWorkItemsOrderUrl("https://example.com/", "Web")).toBeNull();
  });
});

describe("buildWorkItemRelationsUrl", () => {
  it("builds the org-scoped relations URL for a dev.azure.com project", () => {
    expect(buildWorkItemRelationsUrl(PROJECT_HREF, 123)).toBe(
      "https://dev.azure.com/contoso/_apis/wit/workitems/123?$expand=relations&api-version=7.1",
    );
  });

  it("builds the relations URL on the legacy visualstudio.com host", () => {
    expect(buildWorkItemRelationsUrl(LEGACY_HREF, 456)).toBe(
      "https://contoso.visualstudio.com/_apis/wit/workitems/456?$expand=relations&api-version=7.1",
    );
  });

  it("returns null when the href is not a project-scoped ADO location", () => {
    expect(buildWorkItemRelationsUrl("https://example.com/", 123)).toBeNull();
  });
});

describe("buildWorkItemLinkUrl", () => {
  it("builds the bare identity URL for a dev.azure.com project", () => {
    expect(buildWorkItemLinkUrl(PROJECT_HREF, 123)).toBe(
      "https://dev.azure.com/contoso/_apis/wit/workItems/123",
    );
  });

  it("builds the identity URL on the legacy visualstudio.com host", () => {
    expect(buildWorkItemLinkUrl(LEGACY_HREF, 456)).toBe(
      "https://contoso.visualstudio.com/_apis/wit/workItems/456",
    );
  });

  it("carries no api-version, because it is an identity rather than a request", () => {
    expect(buildWorkItemLinkUrl(PROJECT_HREF, 123)).not.toContain("api-version");
  });

  it("returns null when the href is not a project-scoped ADO location", () => {
    expect(buildWorkItemLinkUrl("https://example.com/", 123)).toBeNull();
  });
});

describe("parseReorderedRank", () => {
  it("reads the order from a bare ReorderResult array", () => {
    expect(parseReorderedRank([{ id: 7, order: 1500 }], 7)).toBe(1500);
  });

  it("reads the order from a { value: [...] } envelope", () => {
    expect(
      parseReorderedRank(
        {
          value: [
            { id: 3, order: 10 },
            { id: 7, order: 1500.5 },
          ],
        },
        7,
      ),
    ).toBe(1500.5);
  });

  it("returns null when the body carries no entry for the id", () => {
    expect(parseReorderedRank([{ id: 3, order: 10 }], 7)).toBeNull();
  });

  it("returns null when the entry's order is not a number", () => {
    expect(parseReorderedRank([{ id: 7, order: "1500" }], 7)).toBeNull();
  });

  it("returns null for a non-finite order rather than trusting a fabricated rank", () => {
    expect(parseReorderedRank([{ id: 7, order: Number.NaN }], 7)).toBeNull();
    expect(parseReorderedRank([{ id: 7, order: Number.POSITIVE_INFINITY }], 7)).toBeNull();
  });

  it("returns null for bodies that carry no usable entries at all", () => {
    expect(parseReorderedRank(null, 7)).toBeNull();
    expect(parseReorderedRank(undefined, 7)).toBeNull();
    expect(parseReorderedRank("not a body", 7)).toBeNull();
    expect(parseReorderedRank([null, null], 7)).toBeNull();
    expect(parseReorderedRank({ value: "not an array" }, 7)).toBeNull();
  });
});
