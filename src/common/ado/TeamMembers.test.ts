import { describe, expect, it } from "vitest";

import { buildAdoTeamMembersUrl, parseTeamMembers } from "./TeamMembers";

const PROJECT_HREF = "https://dev.azure.com/contoso/web/_queries/query/abc";

describe("buildAdoTeamMembersUrl", () => {
  it("builds the paged project/team members URL", () => {
    expect(buildAdoTeamMembersUrl(PROJECT_HREF, "Web Team")).toBe(
      "https://dev.azure.com/contoso/_apis/projects/web/teams/Web%20Team/members?$top=100&api-version=7.1",
    );
  });

  it("rejects blank teams and non-project ADO locations", () => {
    expect(buildAdoTeamMembersUrl(PROJECT_HREF, " ")).toBeNull();
    expect(buildAdoTeamMembersUrl("https://example.com", "Web Team")).toBeNull();
  });
});

describe("parseTeamMembers", () => {
  it("normalizes roster identities in response order and removes duplicates", () => {
    expect(
      parseTeamMembers({
        value: [
          {
            identity: {
              id: "alice-id",
              displayName: "Alice",
              uniqueName: "alice@example.com",
              imageUrl: "https://ado/alice.png",
            },
          },
          { identity: { id: "bob-id", displayName: "Bob" } },
          { identity: { id: "alice-id", displayName: "Alice Again" } },
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
      parseTeamMembers({ value: [null, 7, {}, { identity: {} }, { identity: { id: "x" } }] }),
    ).toEqual([]);
    expect(parseTeamMembers(null)).toEqual([]);
    expect(parseTeamMembers({ value: "nope" })).toEqual([]);
  });
});
