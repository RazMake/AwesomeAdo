import { describe, expect, it } from "vitest";

import { queryFolderBreadcrumbs } from "./queryFolderBreadcrumbs";

const QUERY_URL = "https://dev.azure.com/contoso/My%20Project/_queries/query/abc-123";

describe("queryFolderBreadcrumbs", () => {
  it("links each folder to the query hub", () => {
    expect(
      queryFolderBreadcrumbs(
        [
          { label: "Shared Queries", path: "Shared Queries" },
          { label: "Team A", path: "Shared Queries/Team A" },
        ],
        QUERY_URL,
      ),
    ).toEqual([
      {
        label: "Shared Queries",
        url: "https://dev.azure.com/contoso/My%20Project/_queries/folder/?path=Shared%20Queries",
      },
      {
        label: "Team A",
        url: "https://dev.azure.com/contoso/My%20Project/_queries/folder/?path=Shared%20Queries/Team%20A",
      },
    ]);
  });

  it("keeps folders as plain text when the page is not an ADO location", () => {
    expect(
      queryFolderBreadcrumbs(
        [{ label: "Shared Queries", path: "Shared Queries" }],
        "https://example.com/",
      ),
    ).toEqual([{ label: "Shared Queries" }]);
  });

  it("returns no segments for a query without a folder trail", () => {
    expect(queryFolderBreadcrumbs(undefined, QUERY_URL)).toEqual([]);
  });
});
