import { describe, expect, it, vi } from "vitest";

import type { ITeamMembershipReader } from "../ado/TeamMembership";
import type { ILogger } from "../logging/ILogger";
import { DEFAULT_SETTINGS } from "../settings/ExtensionSettings";

import { exportCompactConfig } from "./AwesomeAdoConfig";
import { SharedQueryConfigResolver } from "./SharedQueryConfigResolver";
import { SharedQueryLinkService } from "./SharedQueryLinkService";
import type { SharedQuerySources, SharedQuerySourceStore } from "./SharedQuerySourceStore";
import type { TeamConfigSourceStore } from "./TeamConfigSourceStore";
import type { TeamConfigReader, TeamConfigReadResult } from "./TeamConfigSynchronizer";

const QUERY_ID = "11111111-1111-1111-1111-111111111111";
const WORK_ITEM_ID = 42;

const logger = (): ILogger => ({ info: vi.fn(), error: vi.fn() });

class FakeTeamConfigSource implements TeamConfigSourceStore {
  constructor(private current: number | null) {}
  read = vi.fn(async () => this.current);
  write = vi.fn(async (workItemId: number | null) => {
    this.current = workItemId;
  });
}

class FakeSharedQuerySources implements SharedQuerySourceStore {
  links: SharedQuerySources = {};
  read = vi.fn(async () => this.links);
  link = vi.fn(async (queryId: string, workItemId: number) => {
    this.links = { ...this.links, [queryId]: workItemId };
  });
  unlink = vi.fn(async () => {});
  observe = vi.fn(() => ({ ready: Promise.resolve(), unsubscribe: vi.fn() }));
}

const membership = (answer: boolean | null): ITeamMembershipReader => ({
  isCurrentUserInTeam: vi.fn(async () => answer),
});

function reader(text: string | null): TeamConfigReader {
  return {
    read: vi.fn(async (): Promise<TeamConfigReadResult> =>
      text === null ? { ok: false, error: "HTTP 403" } : { ok: true, text },
    ),
  };
}

const published = (teamId: string | null): string =>
  exportCompactConfig(
    {
      ...DEFAULT_SETTINGS,
      currentTeam: teamId === null ? null : { id: teamId, name: "Crew" },
    },
    { [QUERY_ID]: { view: "sprint", properties: {} } },
  );

interface Harness {
  service: SharedQueryLinkService;
  teamConfigSource: FakeTeamConfigSource;
  sharedSources: FakeSharedQuerySources;
  connect: ReturnType<typeof vi.fn>;
}

function harness(options: {
  connected?: number | null;
  isMember?: boolean | null;
  payload?: string | null;
}): Harness {
  const teamConfigSource = new FakeTeamConfigSource(options.connected ?? null);
  const sharedSources = new FakeSharedQuerySources();
  const connect = vi.fn(async () => {});
  const service = new SharedQueryLinkService(
    new SharedQueryConfigResolver(
      reader(options.payload === undefined ? published("team-guid") : options.payload),
      logger(),
    ),
    teamConfigSource,
    sharedSources,
    membership(options.isMember ?? false),
    connect,
    logger(),
  );
  return { service, teamConfigSource, sharedSources, connect };
}

describe("SharedQueryLinkService", () => {
  it("adopts the work item outright for someone who is on its team", async () => {
    const { service, sharedSources, connect } = harness({ isMember: true });

    await expect(service.apply(QUERY_ID, WORK_ITEM_ID)).resolves.toEqual({
      status: "connected",
      workItemId: WORK_ITEM_ID,
    });
    expect(connect).toHaveBeenCalledWith(WORK_ITEM_ID);
    // A member is a co-owner of that configuration, so nothing is scoped down to one query.
    expect(sharedSources.link).not.toHaveBeenCalled();
  });

  it("gives a non-member a read-only link to that one query and nothing else", async () => {
    const { service, sharedSources, connect, teamConfigSource } = harness({ isMember: false });

    await expect(service.apply(QUERY_ID, WORK_ITEM_ID)).resolves.toEqual({
      status: "linked",
      workItemId: WORK_ITEM_ID,
      queryId: QUERY_ID,
    });
    expect(sharedSources.link).toHaveBeenCalledWith(QUERY_ID, WORK_ITEM_ID);
    expect(connect).not.toHaveBeenCalled();
    expect(teamConfigSource.write).not.toHaveBeenCalled();
  });

  it("takes the narrow path when membership cannot be determined", async () => {
    // An unread roster is not permission. The guest outcome changes nothing the user owns, so it is
    // the only safe answer to a question Azure DevOps did not answer.
    const { service, sharedSources, connect } = harness({ isMember: null });

    await expect(service.apply(QUERY_ID, WORK_ITEM_ID)).resolves.toMatchObject({
      status: "linked",
    });
    expect(sharedSources.link).toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("takes the narrow path when the shared configuration names no team", async () => {
    const { service, connect, sharedSources } = harness({ payload: published(null) });

    await expect(service.apply(QUERY_ID, WORK_ITEM_ID)).resolves.toMatchObject({
      status: "linked",
    });
    expect(connect).not.toHaveBeenCalled();
    expect(sharedSources.link).toHaveBeenCalled();
  });

  it("does nothing at all when the user is already connected to that same work item", async () => {
    const { service, connect, sharedSources } = harness({
      connected: WORK_ITEM_ID,
      isMember: true,
    });

    await expect(service.apply(QUERY_ID, WORK_ITEM_ID)).resolves.toEqual({
      status: "already-connected",
      workItemId: WORK_ITEM_ID,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(sharedSources.link).not.toHaveBeenCalled();
  });

  it("changes nothing when the named work item cannot be read", async () => {
    const { service, connect, sharedSources } = harness({ payload: null });

    await expect(service.apply(QUERY_ID, WORK_ITEM_ID)).resolves.toMatchObject({
      status: "failed",
    });
    expect(connect).not.toHaveBeenCalled();
    expect(sharedSources.link).not.toHaveBeenCalled();
  });

  it("reports a failure rather than throwing when a store rejects", async () => {
    const { service, sharedSources } = harness({ isMember: false });
    sharedSources.link.mockRejectedValueOnce(new Error("storage is full"));

    await expect(service.apply(QUERY_ID, WORK_ITEM_ID)).resolves.toEqual({
      status: "failed",
      workItemId: WORK_ITEM_ID,
      error: "storage is full",
    });
  });
});
