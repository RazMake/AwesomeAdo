import { ADO_API_VERSION } from "./adoApi";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";

const TEAM_MEMBERS_PAGE_SIZE = 100;

/** One person returned by Azure DevOps' team-members endpoint. */
export interface TeamMember {
  id: string;
  displayName: string;
  uniqueName: string | null;
  imageUrl: string | null;
}

/** A team-members read result; an empty team is distinct from a failed read. */
export interface TeamMembersResult {
  members: TeamMember[];
  error: string | null;
}

/** Loads every member of the configured team. */
export interface TeamMembersLoader {
  loadMembers(team: string): Promise<TeamMembersResult>;
}

/** Build the paged Core API URL for one project's team. */
export function buildAdoTeamMembersUrl(href: string, team: string): string | null {
  if (team.trim().length === 0) return null;
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) return null;
  return (
    `${resolved.base}/_apis/projects/${resolved.project}/teams/${encodeURIComponent(team)}/members` +
    `?$top=${TEAM_MEMBERS_PAGE_SIZE}&api-version=${ADO_API_VERSION}`
  );
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseTeamMember(entry: unknown): TeamMember | null {
  const identity = (entry as { identity?: unknown } | null)?.identity;
  if (typeof identity !== "object" || identity === null) return null;
  const fields = identity as Record<string, unknown>;
  const id = optionalString(fields.id);
  const displayName = optionalString(fields.displayName);
  if (id === null || id.length === 0 || displayName === null || displayName.length === 0) {
    return null;
  }
  return {
    id,
    displayName,
    uniqueName: optionalString(fields.uniqueName),
    imageUrl: optionalString(fields.imageUrl),
  };
}

/** Parse and deduplicate ADO team-member identities in server order. */
export function parseTeamMembers(raw: unknown): TeamMember[] {
  const value = (raw as { value?: unknown } | null)?.value;
  if (!Array.isArray(value)) return [];

  const members: TeamMember[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const member = parseTeamMember(entry);
    if (member === null || seen.has(member.id)) continue;
    seen.add(member.id);
    members.push(member);
  }
  return members;
}
