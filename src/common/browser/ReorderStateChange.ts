import {
  UPDATE_WORK_ITEM_FIELD_MESSAGE,
  type UpdateWorkItemFieldMessage,
  type UpdateWorkItemFieldResponse,
} from "./WorkItemFieldRequest";
import type { ReorderWorkItemMessage, ReorderWorkItemResponse } from "./WorkItemReorderRequest";

export type WriteReorderState = (
  message: UpdateWorkItemFieldMessage,
) => Promise<UpdateWorkItemFieldResponse>;

export type ReorderStatePreparation =
  | { ok: true; message: ReorderWorkItemMessage; stateChanged: boolean }
  | { ok: false; response: ReorderWorkItemResponse };

/** Apply a requested state first and carry its revision into the backlog-order operation. */
export async function prepareReorderState(
  message: ReorderWorkItemMessage,
  writeState: WriteReorderState,
): Promise<ReorderStatePreparation> {
  if (message.stateName === undefined) {
    return { ok: true, message, stateChanged: false };
  }
  const result = await writeState({
    type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
    id: message.id,
    rev: message.rev,
    field: "System.State",
    value: message.stateName,
    baseValue: message.stateBaseName,
  });
  if (!result.ok) {
    return {
      ok: false,
      response: { ok: false, error: `state ${result.error ?? "update failed"}`, stage: "state" },
    };
  }
  const withoutState = { ...message };
  delete withoutState.stateName;
  delete withoutState.stateBaseName;
  return {
    ok: true,
    message: { ...withoutState, rev: result.rev ?? message.rev },
    stateChanged: true,
  };
}

/** Preserve a state patch that landed even when the later order operation failed. */
export function withPreparedState(
  response: ReorderWorkItemResponse,
  preparation: Extract<ReorderStatePreparation, { ok: true }>,
): ReorderWorkItemResponse {
  if (!preparation.stateChanged) return response;
  return { ...response, rev: response.rev ?? preparation.message.rev, stateChanged: true };
}
