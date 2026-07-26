import type {
  FeatureCrewAssignee,
  FeatureCrewMember,
  FeatureCrewTagAssignment,
} from "../ado/FeatureCrew";
/**
 * The content→background message contract for reconciling the Feature Crew work item.
 *
 * A content script runs in an isolated world whose origin is `chrome-extension://…`, so it cannot
 * fetch the credentialed ADO REST API itself (CORS-blocked, and a same-origin fetch from the
 * extension page would drop ADO's session cookies). Only the background service worker can run the
 * MAIN-world fetch that carries the signed-in session, so the content side asks it to do so and hand
 * back the result. Keeping the message shape here means both ends agree on one contract instead of
 * drifting apart.
 */
export const RECONCILE_FEATURE_CREW_MESSAGE = "awesomeado:reconcile-feature-crew";

export interface ReconcileFeatureCrewMessage {
  type: typeof RECONCILE_FEATURE_CREW_MESSAGE;
  rootId: number;
  typeName: string;
  assignees: FeatureCrewAssignee[];
  /** Optional hand-picked tag choices to record on the roster (see `FeatureCrewReconcileRequest`). */
  tagAssignments?: FeatureCrewTagAssignment[];
}

export interface ReconcileFeatureCrewResponse {
  ok: boolean;
  changed: boolean;
  id?: number;
  error?: string;
  /** The reconciled roster (each person with their hand-set tag); present only on success. */
  members?: FeatureCrewMember[];
}

export function isReconcileFeatureCrewMessage(
  value: unknown,
): value is ReconcileFeatureCrewMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ReconcileFeatureCrewMessage>;
  if (candidate.type !== RECONCILE_FEATURE_CREW_MESSAGE) {
    return false;
  }
  if (typeof candidate.rootId !== "number") {
    return false;
  }
  if (typeof candidate.typeName !== "string") {
    return false;
  }
  if (!Array.isArray(candidate.assignees)) {
    return false;
  }
  if (!isAssigneeArray(candidate.assignees)) {
    return false;
  }
  // `tagAssignments` is optional; when present it must be a well-formed array of {alias, tag}.
  if (candidate.tagAssignments !== undefined && !isTagAssignmentArray(candidate.tagAssignments)) {
    return false;
  }
  return true;
}

function isAssigneeArray(value: unknown[]): value is FeatureCrewAssignee[] {
  return value.every((assignee) => {
    if (typeof assignee !== "object" || assignee === null) {
      return false;
    }
    const a = assignee as Partial<FeatureCrewAssignee>;
    return typeof a.alias === "string" && typeof a.fullName === "string";
  });
}

function isTagAssignmentArray(value: unknown): value is FeatureCrewTagAssignment[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return false;
    }
    const a = entry as Partial<FeatureCrewTagAssignment>;
    return typeof a.alias === "string" && typeof a.tag === "string";
  });
}
