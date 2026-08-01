export const LOAD_TEAM_MEMBERS_MESSAGE = "awesomeado:load-team-members";

export interface LoadTeamMembersMessage {
  type: typeof LOAD_TEAM_MEMBERS_MESSAGE;
  team: string;
}

export interface LoadTeamMembersResponse {
  raw: unknown;
  status: number;
  /** Transport, validation, or pagination detail when no roster could be returned. */
  error?: string;
}

export function loadTeamMembersMessageProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "message is not an object";
  const candidate = value as Partial<LoadTeamMembersMessage>;
  if (candidate.type !== LOAD_TEAM_MEMBERS_MESSAGE) {
    return `type is "${String(candidate.type)}", expected "${LOAD_TEAM_MEMBERS_MESSAGE}"`;
  }
  if (typeof candidate.team !== "string" || candidate.team.trim().length === 0) {
    return "team must be a non-empty string";
  }
  return null;
}

export function isLoadTeamMembersMessage(value: unknown): value is LoadTeamMembersMessage {
  return loadTeamMembersMessageProblem(value) === null;
}
