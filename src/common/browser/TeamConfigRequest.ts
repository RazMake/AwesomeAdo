import type {
  TeamConfigReadResult,
  TeamConfigWriteResult,
} from "../settings-transfer/TeamConfigSynchronizer";

export const READ_TEAM_CONFIG_MESSAGE = "awesomeado:read-team-config";
export const WRITE_TEAM_CONFIG_MESSAGE = "awesomeado:write-team-config";
const MAX_TEAM_CONFIG_TEXT_LENGTH = 1_000_000;

export interface ReadTeamConfigMessage {
  type: typeof READ_TEAM_CONFIG_MESSAGE;
  workItemId: number;
}

export type ReadTeamConfigResponse = TeamConfigReadResult;

export interface WriteTeamConfigMessage {
  type: typeof WRITE_TEAM_CONFIG_MESSAGE;
  workItemId: number;
  text: string;
}

export type WriteTeamConfigResponse = TeamConfigWriteResult;

export function isReadTeamConfigMessage(value: unknown): value is ReadTeamConfigMessage {
  return isPositiveWorkItemMessage(value, READ_TEAM_CONFIG_MESSAGE);
}

export function isWriteTeamConfigMessage(value: unknown): value is WriteTeamConfigMessage {
  if (!isPositiveWorkItemMessage(value, WRITE_TEAM_CONFIG_MESSAGE)) return false;
  const candidate = value as Partial<WriteTeamConfigMessage>;
  return typeof candidate.text === "string" && candidate.text.length <= MAX_TEAM_CONFIG_TEXT_LENGTH;
}

function isPositiveWorkItemMessage(
  value: unknown,
  type: string,
): value is { type: string; workItemId: number } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { type?: unknown; workItemId?: unknown };
  return (
    candidate.type === type &&
    typeof candidate.workItemId === "number" &&
    Number.isSafeInteger(candidate.workItemId) &&
    candidate.workItemId > 0
  );
}

export function isReadTeamConfigResponse(value: unknown): value is ReadTeamConfigResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ReadTeamConfigResponse>;
  return candidate.ok === true
    ? typeof (candidate as { text?: unknown }).text === "string" || candidate.text === null
    : candidate.ok === false && typeof (candidate as { error?: unknown }).error === "string";
}

export function isWriteTeamConfigResponse(value: unknown): value is TeamConfigWriteResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<TeamConfigWriteResult>;
  return candidate.ok === true || (candidate.ok === false && typeof candidate.error === "string");
}
