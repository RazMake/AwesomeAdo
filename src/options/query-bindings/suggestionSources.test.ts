import { describe, expect, it } from "vitest";

import type { AdoMetadata } from "../../common/ado/AdoMetadata";

import { suggestionsFromMetadata } from "./suggestionSources";

const METADATA: AdoMetadata = {
  teams: [],
  areaPaths: ["Core", "Core\\Platform"],
  iterationPaths: ["Core", "Core\\Sprint 1"],
  queryFolders: ["Shared Queries", "Shared Queries/Team A"],
  workItemTypes: [],
};

describe("suggestionsFromMetadata", () => {
  it("answers each source from its own project vocabulary", () => {
    expect(suggestionsFromMetadata(METADATA, "area-paths")).toEqual(METADATA.areaPaths);
    expect(suggestionsFromMetadata(METADATA, "iteration-paths")).toEqual(METADATA.iterationPaths);
    expect(suggestionsFromMetadata(METADATA, "query-folders")).toEqual(METADATA.queryFolders);
  });

  it("suggests nothing when the project metadata could not be read", () => {
    expect(suggestionsFromMetadata(null, "area-paths")).toEqual([]);
  });
});
