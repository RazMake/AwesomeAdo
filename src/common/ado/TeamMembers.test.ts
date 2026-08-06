import { describe, expect, it, vi } from "vitest";

import {
  buildAdoTeamMembersRequest,
  buildAdoTeamMembersUrl,
  expandTeamMembers,
  parseTeamMembers,
  type LoadTeamGroupMembers,
} from "./TeamMembers";

const PROJECT_HREF = "https://dev.azure.com/contoso/web/_queries/query/abc";

const directRosterWithGroup = {
  value: [
    {
      identity: {
        id: "group-id",
        displayName: "Nested group",
        descriptor: "group-1",
        isContainer: true,
      },
    },
    {
      identity: {
        id: "alice-id",
        displayName: "Alice",
        uniqueName: "alice@example.com",
        imageUrl: "https://ado/alice.png",
      },
    },
  ],
};

function groupMembers(descriptor: string) {
  return {
    status: 200,
    successors:
      descriptor === "group-1"
        ? [
            {
              entityType: "User",
              localId: "alice-id",
              displayName: "Alice Again",
              signInAddress: "alice@example.com",
            },
            {
              entityType: "User",
              localId: "bob-id",
              displayName: "Bob",
              mail: "bob@example.com",
            },
            { entityType: "Group", subjectDescriptor: "group-2" },
          ]
        : [
            { entityType: "User", localId: "carol-id", displayName: "Carol" },
            { entityType: "Group", subjectDescriptor: "group-1" },
          ],
  };
}

describe("buildAdoTeamMembersUrl", () => {
  it("builds the paged project/team members URL", () => {
    expect(buildAdoTeamMembersUrl(PROJECT_HREF, "Web Team")).toBe(
      "https://dev.azure.com/contoso/_apis/projects/web/teams/Web%20Team/members?$top=100&api-version=7.1",
    );
    expect(buildAdoTeamMembersRequest(PROJECT_HREF, "Web Team")).toEqual({
      teamMembersUrl:
        "https://dev.azure.com/contoso/_apis/projects/web/teams/Web%20Team/members?$top=100&api-version=7.1",
      identityPickerUrl:
        "https://dev.azure.com/contoso/_apis/IdentityPicker/Identities?api-version=5.0-preview.1",
    });
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
          {
            identity: {
              id: "group-id",
              displayName: "Nested group",
              isContainer: true,
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

describe("expandTeamMembers", () => {
  it("recursively replaces groups with users and removes direct-member duplicates", async () => {
    const loadGroup = vi.fn<LoadTeamGroupMembers>(async (descriptor) => groupMembers(descriptor));

    const result = await expandTeamMembers(directRosterWithGroup, loadGroup);

    expect(result).toEqual({
      status: 200,
      raw: {
        value: [
          {
            identity: {
              id: "alice-id",
              displayName: "Alice",
              uniqueName: "alice@example.com",
              imageUrl: "https://ado/alice.png",
            },
          },
          {
            identity: {
              id: "bob-id",
              displayName: "Bob",
              uniqueName: "bob@example.com",
              imageUrl: null,
            },
          },
          {
            identity: {
              id: "carol-id",
              displayName: "Carol",
              uniqueName: null,
              imageUrl: null,
            },
          },
        ],
      },
    });
    expect(loadGroup.mock.calls.map(([descriptor]) => descriptor)).toEqual(["group-1", "group-2"]);
  });
});

describe("expandTeamMembers failures", () => {
  it("fails rather than returning a partial roster when group expansion fails", async () => {
    const loadGroup = vi.fn<LoadTeamGroupMembers>().mockResolvedValue({
      successors: null,
      status: 403,
      error: "HTTP 403",
    });

    await expect(
      expandTeamMembers({ value: [directRosterWithGroup.value[0]] }, loadGroup),
    ).resolves.toEqual({ raw: null, status: 403, error: "HTTP 403" });
  });
});
