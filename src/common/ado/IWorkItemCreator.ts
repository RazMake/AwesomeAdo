import type { NewWorkItem } from "./createWorkItem";

/** The outcome of creating a work item: the new item's id, or a short description of the failure. */
export interface WorkItemCreateResult {
  ok: boolean;
  /** The id Azure DevOps assigned; present only when `ok`. */
  id?: number;
  /** The item's revision as created, so a follow-up write can be guarded without re-reading it. */
  rev?: number;
  /**
   * The item's fields exactly as Azure DevOps created them.
   *
   * Carried back so a caller showing the new item straight away shows the values the PROCESS chose —
   * its starting state, its default priority, the classification paths it filled in — rather than
   * blanks that silently correct themselves on the next refresh.
   */
  fields?: Record<string, unknown>;
  error?: string;
}

/**
 * Creates a work item in Azure DevOps.
 *
 * Deliberately its own capability rather than a method on the field writer (Interface Segregation):
 * every other write in this extension changes an item that already exists and is guarded by that
 * item's revision, while creation has no revision to guard and no id until Azure DevOps answers.
 */
export interface IWorkItemCreator {
  create(item: NewWorkItem): Promise<WorkItemCreateResult>;
}
