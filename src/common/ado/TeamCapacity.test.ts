import { describe, expect, it } from "vitest";

import { buildAdoCapacityUrl, parseTeamCapacity } from "./TeamCapacity";

const PROJECT_HREF = "https://dev.azure.com/contoso/web/_queries/query/abc";

describe("buildAdoCapacityUrl", () => {
  it("builds the team and iteration scoped capacities URL", () => {
    expect(buildAdoCapacityUrl(PROJECT_HREF, "Web Team", "iteration/id")).toBe(
      "https://dev.azure.com/contoso/web/Web%20Team/_apis/work/teamsettings/iterations/iteration%2Fid/capacities?api-version=7.1",
    );
  });

  it("rejects blank identifiers and non-project ADO locations", () => {
    expect(buildAdoCapacityUrl(PROJECT_HREF, "", "iteration-id")).toBeNull();
    expect(buildAdoCapacityUrl(PROJECT_HREF, "Web", "  ")).toBeNull();
    expect(buildAdoCapacityUrl("https://example.com", "Web", "iteration-id")).toBeNull();
  });
});

describe("parseTeamCapacity", () => {
  it("normalizes roster identities in response order and removes duplicates", () => {
    expect(
      parseTeamCapacity({
        value: [
          {
            teamMember: {
              id: "alice-id",
              displayName: "Alice",
              uniqueName: "alice@example.com",
              imageUrl: "https://ado/alice.png",
            },
          },
          { teamMember: { id: "bob-id", displayName: "Bob" } },
          { teamMember: { id: "alice-id", displayName: "Alice Again" } },
        ],
      }),
    ).toEqual([
      {
        id: "alice-id",
        displayName: "Alice",
        uniqueName: "alice@example.com",
        imageUrl: "https://ado/alice.png",
      },
      { id: "bob-id", displayName: "Bob", uniqueName: null, imageUrl: null },
    ]);
  });

  it("drops malformed entries and tolerates a malformed body", () => {
    expect(
      parseTeamCapacity({ value: [null, 7, {}, { teamMember: {} }, { teamMember: { id: "x" } }] }),
    ).toEqual([]);
    expect(parseTeamCapacity(null)).toEqual([]);
    expect(parseTeamCapacity({ value: "nope" })).toEqual([]);
  });
});
