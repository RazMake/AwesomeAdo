import type {
  TeamConfigReadResult,
  TeamConfigWriteResult,
} from "../settings-transfer/TeamConfigSynchronizer";

export const READ_TEAM_CONFIG_MESSAGE = "awesomeado:read-team-config";

export interface ReadTeamConfigMessage {
  type: typeof READ_TEAM_CONFIG_MESSAGE;
  workItemId: number;
}

export type ReadTeamConfigResponse = TeamConfigReadResult;

export function isReadTeamConfigMessage(value: unknown): value is ReadTeamConfigMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ReadTeamConfigMessage>;
  return (
    candidate.type === READ_TEAM_CONFIG_MESSAGE &&
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
