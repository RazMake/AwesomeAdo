/** The content-to-background contract for loading one team's capacity roster for one iteration. */
export const LOAD_SPRINT_CAPACITY_MESSAGE = "awesomeado:load-sprint-capacity";

export interface LoadSprintCapacityMessage {
  type: typeof LOAD_SPRINT_CAPACITY_MESSAGE;
  team: string;
  iterationId: string;
}

export interface LoadSprintCapacityResponse {
  raw: unknown;
  /** HTTP status from the capacity read; 0 means no response or injection failure. */
  status: number;
}

export function isLoadSprintCapacityMessage(value: unknown): value is LoadSprintCapacityMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<LoadSprintCapacityMessage>;
  return (
    candidate.type === LOAD_SPRINT_CAPACITY_MESSAGE &&
    typeof candidate.team === "string" &&
    typeof candidate.iterationId === "string"
  );
}
