import { describe, expect, it } from "vitest";

import { buildInterruptAcceptanceUrls } from "./fetchInterruptAcceptance";

describe("buildInterruptAcceptanceUrls", () => {
  it("builds a paged update URL from a project-scoped ADO page", () => {
    expect(
      buildInterruptAcceptanceUrls(
        "https://dev.azure.com/example/My%20Project/_queries/query/id/",
        42,
      ),
    ).toEqual({
      updatesUrl:
        "https://dev.azure.com/example/My%20Project/_apis/wit/workItems/42/updates?api-version=7.1&$top=200&$skip=0",
    });
  });

  it("rejects unsupported and non-project locations", () => {
    expect(buildInterruptAcceptanceUrls("https://example.com/project", 42)).toBeNull();
    expect(buildInterruptAcceptanceUrls("https://dev.azure.com/example/", 42)).toBeNull();
  });
});
