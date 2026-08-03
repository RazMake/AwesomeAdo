import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../logging/ILogger";

import type { TeamMember, TeamMembersLoader } from "./TeamMembers";
import { TeamMembershipReader } from "./TeamMembership";
import type { ICurrentUserReader } from "./currentUser";

const logger = (): ILogger => ({ info: vi.fn(), error: vi.fn() });

const member = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  id: "guid-one",
  displayName: "Alice Smith",
  uniqueName: "alice@example.com",
  imageUrl: null,
  ...overrides,
});

function roster(members: TeamMember[], error: string | null = null): TeamMembersLoader {
  return { loadMembers: vi.fn(async () => ({ members, error })) };
}

const identity = (
  value: { displayName: string; id: string | null; uniqueName: string | null } | null,
): ICurrentUserReader => ({ readCurrentUser: vi.fn(async () => value) });

const ALICE = { displayName: "Alice Smith", id: "guid-one", uniqueName: "alice@example.com" };

describe("TeamMembershipReader", () => {
  it("confirms membership when the roster carries the signed-in identity GUID", async () => {
    const reader = new TeamMembershipReader(roster([member()]), identity(ALICE), logger());

    await expect(reader.isCurrentUserInTeam("team-guid")).resolves.toBe(true);
  });

  it("matches on the sign-in address when the GUIDs are cased differently", async () => {
    const reader = new TeamMembershipReader(
      roster([member({ id: "OTHER", uniqueName: "ALICE@EXAMPLE.COM" })]),
      identity(ALICE),
      logger(),
    );

    await expect(reader.isCurrentUserInTeam("team-guid")).resolves.toBe(true);
  });

  it("denies membership when the roster does not carry the signed-in identity", async () => {
    const reader = new TeamMembershipReader(
      roster([member({ id: "guid-two", uniqueName: "bob@example.com" })]),
      identity(ALICE),
      logger(),
    );

    await expect(reader.isCurrentUserInTeam("team-guid")).resolves.toBe(false);
  });

  it("reports an undetermined answer when the roster could not be read", async () => {
    // Distinct from `false` on purpose: a caller that grants trust on membership must be able to
    // tell an authoritative "no" apart from a question Azure DevOps never answered.
    const reader = new TeamMembershipReader(roster([], "HTTP 403"), identity(ALICE), logger());

    await expect(reader.isCurrentUserInTeam("team-guid")).resolves.toBeNull();
  });

  it("reports an undetermined answer when nobody is identifiably signed in", async () => {
    const reader = new TeamMembershipReader(roster([member()]), identity(null), logger());

    await expect(reader.isCurrentUserInTeam("team-guid")).resolves.toBeNull();
  });

  it("asks nothing when no team was named", async () => {
    const members = roster([member()]);
    const reader = new TeamMembershipReader(members, identity(ALICE), logger());

    await expect(reader.isCurrentUserInTeam("  ")).resolves.toBeNull();
    expect(members.loadMembers).not.toHaveBeenCalled();
  });

  it("does not match an identity that has neither handle in common with a member", async () => {
    const reader = new TeamMembershipReader(
      roster([member({ uniqueName: null })]),
      identity({ displayName: "Alice", id: null, uniqueName: "alice@example.com" }),
      logger(),
    );

    await expect(reader.isCurrentUserInTeam("team-guid")).resolves.toBe(false);
  });
});
