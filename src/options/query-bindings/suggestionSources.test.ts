import { describe, expect, it } from "vitest";

import type { AdoMetadata } from "../../common/ado/AdoMetadata";

import { queryFoldersFromMetadata, suggestionsFromMetadata } from "./suggestionSources";

const METADATA: AdoMetadata = {
  teams: [],
  areaPaths: ["Core", "Core\\Platform"],
  iterationPaths: ["Core", "Core\\Sprint 1"],
  queryFolders: [
    { path: "Shared Queries", hasUnreadChildren: false },
    { path: "Shared Queries/Team A", hasUnreadChildren: true },
  ],
  workItemTypes: [],
};

describe("suggestionsFromMetadata", () => {
  it("answers each source from its own project vocabulary", () => {
    expect(suggestionsFromMetadata(METADATA, "area-paths")).toEqual(METADATA.areaPaths);
    expect(suggestionsFromMetadata(METADATA, "iteration-paths")).toEqual(METADATA.iterationPaths);
  });

  it("suggests nothing when the project metadata could not be read", () => {
    expect(suggestionsFromMetadata(null, "area-paths")).toEqual([]);
  });
});

describe("queryFoldersFromMetadata", () => {
  it("hands over the folders the picker starts from, with their truncation flag", () => {
    expect(queryFoldersFromMetadata(METADATA)).toEqual(METADATA.queryFolders);
  });

  it("offers no folders when the project metadata could not be read", () => {
    expect(queryFoldersFromMetadata(null)).toEqual([]);
  });
});
