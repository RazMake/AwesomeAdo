import { describe, expect, it } from "vitest";

import { buildInterruptAcceptanceUrls } from "./fetchInterruptAcceptance";

describe("buildInterruptAcceptanceUrls", () => {
  it("builds paged update and Discussion URLs from a project-scoped ADO page", () => {
    expect(
      buildInterruptAcceptanceUrls(
        "https://dev.azure.com/example/My%20Project/_queries/query/id/",
        42,
      ),
    ).toEqual({
      updatesUrl:
        "https://dev.azure.com/example/My%20Project/_apis/wit/workItems/42/updates?api-version=7.1&$top=200&$skip=0",
      commentsUrl:
        "https://dev.azure.com/example/My%20Project/_apis/wit/workItems/42/comments?api-version=7.1-preview.4&$top=200&order=desc",
    });
  });

  it("rejects unsupported and non-project locations", () => {
    expect(buildInterruptAcceptanceUrls("https://example.com/project", 42)).toBeNull();
    expect(buildInterruptAcceptanceUrls("https://dev.azure.com/example/", 42)).toBeNull();
  });
});
