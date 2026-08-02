import {
  MAX_INTERRUPT_ACCEPTANCE_ITEMS,
  MAX_INTERRUPT_MARKER_LENGTH,
} from "../ado/fetchInterruptAcceptance";
import type { InterruptAcceptanceEvidence } from "../ado/interruptAcceptance";

export const READ_INTERRUPT_ACCEPTANCE_MESSAGE = "awesomeado:read-interrupt-acceptance";

export interface ReadInterruptAcceptanceMessage {
  type: typeof READ_INTERRUPT_ACCEPTANCE_MESSAGE;
  workItemIds: number[];
  interruptTag: string;
  acceptanceTag: string;
}

export interface RawInterruptAcceptance {
  evidence: Array<InterruptAcceptanceEvidence & { workItemId: number }>;
  failedIds: number[];
  failure: "none" | "http" | "sign-in" | "network" | "limit";
  status: number;
}

export interface ReadInterruptAcceptanceResponse {
  raw: RawInterruptAcceptance | null;
  error?: string;
}

function markerProblem(name: string, value: unknown): string | null {
  return typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > MAX_INTERRUPT_MARKER_LENGTH
    ? `${name} is empty, non-string, or over ${MAX_INTERRUPT_MARKER_LENGTH} characters`
    : null;
}

/** Why a content-supplied acceptance request is unsafe, or null when it is closed and bounded. */
export function readInterruptAcceptanceMessageProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "message is not an object";
  const candidate = value as Partial<ReadInterruptAcceptanceMessage>;
  if (candidate.type !== READ_INTERRUPT_ACCEPTANCE_MESSAGE) {
    return `type is "${String(candidate.type)}", expected "${READ_INTERRUPT_ACCEPTANCE_MESSAGE}"`;
  }
  const ids = candidate.workItemIds;
  if (!Array.isArray(ids) || ids.length === 0) return "workItemIds is not a non-empty array";
  if (ids.length > MAX_INTERRUPT_ACCEPTANCE_ITEMS) {
    return `workItemIds carries ${ids.length} ids, more than the ${MAX_INTERRUPT_ACCEPTANCE_ITEMS} ceiling`;
  }
  if (!ids.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)) {
    return "workItemIds contains an entry that is not a positive integer";
  }
  return (
    markerProblem("interruptTag", candidate.interruptTag) ??
    markerProblem("acceptanceTag", candidate.acceptanceTag)
  );
}
