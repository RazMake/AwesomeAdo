import type { FeatureCrewAssignee, FeatureCrewMember } from "./FeatureCrew";

/**
 * The request to reconcile a Feature Crew work item: create or update the roster so it contains all
 * currently assigned people from the project's tree. The Feature Crew work item is the dedicated
 * storage spot for the full roster (parked in `Removed` so ordinary queries ignore it), and this
 * contract asks an implementation to merge the given assignees into it (adding any missing people but
 * leaving existing entries and their manually-added tags untouched).
 */
export interface FeatureCrewReconcileRequest {
  /** The root work item's id, used to create the "Affected By" relation on a new Feature Crew item. */
  rootId: number;
  /** The last configured work item type (from the project's metadata), used to create the item. */
  typeName: string;
  /** The distinct people currently assigned somewhere in the project, in first-seen order. */
  assignees: FeatureCrewAssignee[];
}

/**
 * The result of reconciling the Feature Crew work item: success or failure, plus whether the roster
 * was actually changed (so the caller can skip an unnecessary view refresh when nothing was added).
 */
export interface FeatureCrewReconcileResult {
  /** Whether the reconcile succeeded; false means `id` is undefined and an error was logged. */
  ok: boolean;
  /** True when at least one person was added to the roster; false when the roster already covered all assignees. */
  changed: boolean;
  /** The Feature Crew work item's id when the reconcile succeeded; undefined on error. */
  id?: number;
  /**
   * The reconciled roster (everyone on the item now, with the tags a developer set by hand), so the
   * caller can project each person's tag onto the tree. Present only on success; undefined on error.
   */
  members?: FeatureCrewMember[];
}

/**
 * Reconciles the Feature Crew work item: finds or creates the dedicated roster (a single item parked
 * in `Removed` with a fixed title and "Affected By" relation to the project root), merges the given
 * assignees into it, and patches when at least one person was added. The contract is kept abstract so
 * the view depends on this interface (Dependency Inversion): the real implementation injects a
 * credentialed fetch into the ADO tab's page (MAIN) world (the only context that can access the APIs
 * with the user's session cookies), and a test fake returns canned results.
 */
export interface IFeatureCrewWriter {
  reconcile(request: FeatureCrewReconcileRequest): Promise<FeatureCrewReconcileResult>;
}
