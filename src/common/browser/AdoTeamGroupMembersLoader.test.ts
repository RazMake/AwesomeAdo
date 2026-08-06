import { describe, expect, it, vi } from "vitest";

import {
  AdoTeamGroupMembersLoader,
  type LookupTeamGroup,
  type ReadTeamGroupConnections,
} from "./AdoTeamGroupMembersLoader";

const PICKER_URL =
  "https://dev.azure.com/contoso/_apis/IdentityPicker/Identities?api-version=5.0-preview.1";

const lookupResult = (descriptor: string) => ({
  status: 200,
  failure: "none" as const,
  body: {
    results: [
      {
        identities: [{ subjectDescriptor: descriptor, entityType: "Group", entityId: "entity-1" }],
      },
    ],
  },
});

describe("AdoTeamGroupMembersLoader", () => {
  it("resolves a descriptor and reads its direct successors", async () => {
    const lookup = vi.fn<LookupTeamGroup>().mockResolvedValue(lookupResult("group-1"));
    const successors = [{ entityType: "User", localId: "alice" }];
    const read = vi
      .fn<ReadTeamGroupConnections>()
      .mockResolvedValue({ raw: { successors }, status: 200 });
    const loader = new AdoTeamGroupMembersLoader(PICKER_URL, lookup, read);

    await expect(loader.load("group-1")).resolves.toEqual({ successors, status: 200 });
    expect(JSON.parse(String(lookup.mock.calls[0]?.[1]))).toMatchObject({
      query: "group-1",
      queryTypeHint: "uid",
    });
    expect(read.mock.calls[0]?.[0]).toContain(
      "/Identities/entity-1/connections?api-version=5.0-preview.1",
    );
    expect(read.mock.calls[0]?.[0]).toContain("connectionTypes=successors");
  });

  it("preserves lookup and connections failures", async () => {
    const failedLookup = new AdoTeamGroupMembersLoader(
      PICKER_URL,
      vi.fn<LookupTeamGroup>().mockResolvedValue({ status: 403, body: null, failure: "http" }),
      vi.fn<ReadTeamGroupConnections>(),
    );
    await expect(failedLookup.load("group-1")).resolves.toEqual({
      successors: null,
      status: 403,
      error: "group lookup failed (http, HTTP 403)",
    });

    const failedConnections = new AdoTeamGroupMembersLoader(
      PICKER_URL,
      vi.fn<LookupTeamGroup>().mockResolvedValue(lookupResult("group-1")),
      vi
        .fn<ReadTeamGroupConnections>()
        .mockResolvedValue({ raw: null, status: 503, error: "HTTP 503" }),
    );
    await expect(failedConnections.load("group-1")).resolves.toEqual({
      successors: null,
      status: 503,
      error: "HTTP 503",
    });
  });

  it("rejects missing and malformed answers", async () => {
    const missing = new AdoTeamGroupMembersLoader(
      PICKER_URL,
      vi.fn<LookupTeamGroup>().mockResolvedValue(undefined),
      vi.fn<ReadTeamGroupConnections>(),
    );
    await expect(missing.load("group-1")).resolves.toEqual({
      successors: null,
      status: 0,
      error: "group lookup returned no result",
    });

    const malformed = new AdoTeamGroupMembersLoader(
      PICKER_URL,
      vi.fn<LookupTeamGroup>().mockResolvedValue(lookupResult("group-1")),
      vi.fn<ReadTeamGroupConnections>().mockResolvedValue({ raw: {}, status: 200 }),
    );
    await expect(malformed.load("group-1")).resolves.toEqual({
      successors: null,
      status: 200,
      error: "group connections response has no successors array",
    });
  });
});
