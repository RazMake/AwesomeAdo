import { ADO_API_VERSION } from "./adoApi";
import { buildTeamScopedApiUrl } from "./fetchAdoMetadata";

/** One person returned by a sprint's Azure DevOps capacity roster. */
export interface SprintCapacityMember {
  id: string;
  displayName: string;
  uniqueName: string | null;
  imageUrl: string | null;
}

/** A capacity read result; an empty successful roster is distinct from a failed read. */
export interface SprintCapacityResult {
  members: SprintCapacityMember[];
  error: string | null;
}

/** Loads the configured team's roster for one iteration. */
export interface TeamCapacityLoader {
  loadCapacity(team: string, iterationId: string): Promise<SprintCapacityResult>;
}

/** Build the team/iteration-scoped capacities URL, or null when either identifier is blank. */
export function buildAdoCapacityUrl(
  href: string,
  team: string,
  iterationId: string,
): string | null {
  if (iterationId.trim().length === 0) {
    return null;
  }
  return buildTeamScopedApiUrl(
    href,
    team,
    `work/teamsettings/iterations/${encodeURIComponent(iterationId)}/capacities`,
    ADO_API_VERSION,
  );
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseCapacityMember(entry: unknown): SprintCapacityMember | null {
  const teamMember = (entry as { teamMember?: unknown } | null)?.teamMember;
  if (typeof teamMember !== "object" || teamMember === null) {
    return null;
  }
  const identity = teamMember as Record<string, unknown>;
  const id = optionalString(identity.id);
  const displayName = optionalString(identity.displayName);
  if (id === null || id.length === 0 || displayName === null || displayName.length === 0) {
    return null;
  }
  return {
    id,
    displayName,
    uniqueName: optionalString(identity.uniqueName),
    imageUrl: optionalString(identity.imageUrl),
  };
}

/** Parse and deduplicate the identity portion of ADO's `TeamMemberCapacity[]` response. */
export function parseTeamCapacity(raw: unknown): SprintCapacityMember[] {
  const value = (raw as { value?: unknown } | null)?.value;
  if (!Array.isArray(value)) {
    return [];
  }

  const members: SprintCapacityMember[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const member = parseCapacityMember(entry);
    if (member === null || seen.has(member.id)) {
      continue;
    }
    seen.add(member.id);
    members.push(member);
  }
  return members;
}
