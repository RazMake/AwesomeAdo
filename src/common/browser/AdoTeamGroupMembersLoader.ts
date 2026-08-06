import {
  buildTeamGroupConnectionsUrl,
  buildTeamGroupLookupBody,
  parseTeamGroupEntityId,
  type TeamGroupMembersResult,
} from "../ado/TeamMembers";

import type { AdoPageRequestOutcome } from "./executeAdoRequestInPage";
import type { AdoIdentitySearchOutcome } from "./fetchAdoIdentitiesInPage";

export type LookupTeamGroup = (
  identityPickerUrl: string,
  body: string,
) => Promise<AdoIdentitySearchOutcome | undefined>;
export type ReadTeamGroupConnections = (url: string) => Promise<AdoPageRequestOutcome | undefined>;

function lookupProblem(
  lookup: AdoIdentitySearchOutcome | undefined,
): TeamGroupMembersResult | null {
  if (lookup === undefined) {
    return { successors: null, status: 0, error: "group lookup returned no result" };
  }
  return lookup.failure === "none" && lookup.body !== null
    ? null
    : {
        successors: null,
        status: lookup.status,
        error: `group lookup failed (${lookup.failure}, HTTP ${lookup.status})`,
      };
}

function connectionsResult(connections: AdoPageRequestOutcome | undefined): TeamGroupMembersResult {
  if (connections === undefined || connections.raw === null) {
    return {
      successors: null,
      status: connections?.status ?? 0,
      error: connections?.error ?? "group connections returned no result",
    };
  }
  const successors = (connections.raw as { successors?: unknown }).successors;
  return Array.isArray(successors)
    ? { successors, status: connections.status }
    : {
        successors: null,
        status: connections.status,
        error: "group connections response has no successors array",
      };
}

/** Composes the existing injected picker POST and retrying GET for one direct group expansion. */
export class AdoTeamGroupMembersLoader {
  constructor(
    private readonly identityPickerUrl: string,
    private readonly lookup: LookupTeamGroup,
    private readonly readConnections: ReadTeamGroupConnections,
  ) {}

  async load(descriptor: string): Promise<TeamGroupMembersResult> {
    const lookup = await this.lookup(this.identityPickerUrl, buildTeamGroupLookupBody(descriptor));
    const problem = lookupProblem(lookup);
    if (problem !== null) return problem;
    const successfulLookup = lookup as AdoIdentitySearchOutcome & { body: unknown };
    const entityId = parseTeamGroupEntityId(successfulLookup.body, descriptor);
    if (entityId === null) {
      return {
        successors: null,
        status: successfulLookup.status,
        error: "group descriptor was not resolved",
      };
    }
    const connections = await this.readConnections(
      buildTeamGroupConnectionsUrl(this.identityPickerUrl, entityId),
    );
    return connectionsResult(connections);
  }
}
