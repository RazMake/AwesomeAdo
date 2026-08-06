import { ADO_API_VERSION } from "./adoApi";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";

const TEAM_MEMBERS_PAGE_SIZE = 100;
const IDENTITY_PICKER_API_VERSION = "5.0-preview.1";

/** Trusted same-origin endpoints needed to read and expand one team's roster. */
export interface TeamMembersRequest {
  teamMembersUrl: string;
  identityPickerUrl: string;
}

/** One direct group expansion returned by the Identity Picker connections endpoint. */
export interface TeamGroupMembersResult {
  successors: unknown[] | null;
  status: number;
  error?: string;
}

/** Reads one group's direct successors; recursive traversal remains domain logic here. */
export type LoadTeamGroupMembers = (descriptor: string) => Promise<TeamGroupMembersResult>;

/** The raw roster envelope passed back through the existing content/background contract. */
export interface ExpandedTeamMembersResult {
  raw: { value: unknown[] } | null;
  status: number;
  error?: string;
}

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

/** Build the Core roster and Identity Picker URLs for one project's team. */
export function buildAdoTeamMembersRequest(href: string, team: string): TeamMembersRequest | null {
  if (team.trim().length === 0) return null;
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) return null;
  return {
    teamMembersUrl:
      `${resolved.base}/_apis/projects/${resolved.project}/teams/${encodeURIComponent(team)}/members` +
      `?$top=${TEAM_MEMBERS_PAGE_SIZE}&api-version=${ADO_API_VERSION}`,
    identityPickerUrl:
      `${resolved.base}/_apis/IdentityPicker/Identities` +
      `?api-version=${IDENTITY_PICKER_API_VERSION}`,
  };
}

/** Build the paged Core API URL for one project's team. */
export function buildAdoTeamMembersUrl(href: string, team: string): string | null {
  return buildAdoTeamMembersRequest(href, team)?.teamMembersUrl ?? null;
}

/** Build the exact descriptor lookup body used by Azure DevOps' own group-members UI. */
export function buildTeamGroupLookupBody(descriptor: string): string {
  return JSON.stringify({
    query: descriptor,
    identityTypes: ["user", "group"],
    operationScopes: ["ims", "source"],
    queryTypeHint: "uid",
    options: { MinResults: 1, MaxResults: 10 },
    properties: ["DisplayName", "SubjectDescriptor", "Mail", "SignInAddress"],
  });
}

function resolvedGroupEntityId(candidate: unknown, descriptor: string): string | null {
  const fields = candidate as Record<string, unknown> | null;
  return fields?.subjectDescriptor === descriptor &&
    fields.entityType === "Group" &&
    typeof fields.entityId === "string"
    ? fields.entityId
    : null;
}

/** Resolve the picker's opaque entity id for the exact group descriptor requested. */
export function parseTeamGroupEntityId(raw: unknown, descriptor: string): string | null {
  const results = (raw as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return null;
  for (const result of results) {
    const identities = (result as { identities?: unknown } | null)?.identities;
    if (!Array.isArray(identities)) continue;
    for (const candidate of identities) {
      const entityId = resolvedGroupEntityId(candidate, descriptor);
      if (entityId !== null) return entityId;
    }
  }
  return null;
}

/** Build the same-origin direct-successors URL used by Azure DevOps Team settings. */
export function buildTeamGroupConnectionsUrl(identityPickerUrl: string, entityId: string): string {
  const url = new URL(identityPickerUrl);
  url.pathname += `/${encodeURIComponent(entityId)}/connections`;
  for (const identityType of ["user", "group", "servicePrincipal"]) {
    url.searchParams.append("identityTypes", identityType);
  }
  for (const scope of ["ims", "source"]) url.searchParams.append("operationScopes", scope);
  url.searchParams.set("connectionTypes", "successors");
  url.searchParams.set("depth", "1");
  for (const property of ["DisplayName", "SubjectDescriptor", "Mail", "SignInAddress"]) {
    url.searchParams.append("properties", property);
  }
  return url.toString();
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
  if (
    fields.isContainer === true ||
    id === null ||
    id.length === 0 ||
    displayName === null ||
    displayName.length === 0
  ) {
    return null;
  }
  return {
    id,
    displayName,
    uniqueName: optionalString(fields.uniqueName),
    imageUrl: optionalString(fields.imageUrl),
  };
}

function groupDescriptor(entry: unknown): string | null {
  const identity = (entry as { identity?: unknown } | null)?.identity as Record<
    string,
    unknown
  > | null;
  return identity?.isContainer === true && typeof identity.descriptor === "string"
    ? identity.descriptor
    : null;
}

function identityId(entry: unknown): string | null {
  const identity = (entry as { identity?: unknown } | null)?.identity as Record<
    string,
    unknown
  > | null;
  return typeof identity?.id === "string" ? identity.id : null;
}

function successorEntry(successor: unknown): unknown | null {
  const fields = successor as Record<string, unknown> | null;
  if (
    fields?.entityType !== "User" ||
    typeof fields.localId !== "string" ||
    typeof fields.displayName !== "string"
  ) {
    return null;
  }
  return {
    identity: {
      id: fields.localId,
      displayName: fields.displayName,
      uniqueName:
        typeof fields.signInAddress === "string"
          ? fields.signInAddress
          : typeof fields.mail === "string"
            ? fields.mail
            : null,
      imageUrl: null,
    },
  };
}

function appendSuccessors(
  successors: unknown[],
  queue: string[],
  entries: unknown[],
  seenIds: Set<string>,
): void {
  for (const successor of successors) {
    const fields = successor as Record<string, unknown> | null;
    if (fields?.entityType === "Group" && typeof fields.subjectDescriptor === "string") {
      queue.push(fields.subjectDescriptor);
      continue;
    }
    const entry = successorEntry(successor);
    const id = identityId(entry);
    if (entry === null || id === null || seenIds.has(id)) continue;
    seenIds.add(id);
    entries.push(entry);
  }
}

const MAX_TEAM_GROUPS = 100;

async function expandQueuedGroups(
  queue: string[],
  entries: unknown[],
  seenIds: Set<string>,
  loadGroup: LoadTeamGroupMembers,
): Promise<ExpandedTeamMembersResult> {
  const seenGroups = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const descriptor = queue[index]!;
    if (seenGroups.has(descriptor)) continue;
    if (seenGroups.size >= MAX_TEAM_GROUPS) {
      return {
        raw: null,
        status: 0,
        error: `team group expansion exceeded ${MAX_TEAM_GROUPS} groups`,
      };
    }
    seenGroups.add(descriptor);
    const result = await loadGroup(descriptor);
    if (result.successors === null) {
      return { raw: null, status: result.status, error: result.error };
    }
    appendSuccessors(result.successors, queue, entries, seenIds);
  }
  return { raw: { value: entries }, status: 200 };
}

/** Replace direct group containers with every recursively nested user, deduplicated by local id. */
export function expandTeamMembers(
  raw: unknown,
  loadGroup: LoadTeamGroupMembers,
): Promise<ExpandedTeamMembersResult> {
  const value = (raw as { value?: unknown } | null)?.value;
  if (!Array.isArray(value)) {
    return Promise.resolve({
      raw: null,
      status: 0,
      error: "team-member response has no value array",
    });
  }
  const entries = value.filter((entry) => groupDescriptor(entry) === null);
  const queue = value.map(groupDescriptor).filter((entry): entry is string => entry !== null);
  const seenIds = new Set(
    entries.map(identityId).filter((entry): entry is string => entry !== null),
  );
  return expandQueuedGroups(queue, entries, seenIds, loadGroup);
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
