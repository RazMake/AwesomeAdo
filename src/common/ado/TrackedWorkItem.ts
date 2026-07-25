/**
 * The normalized work-item tree data model for Project Tracking views.
 *
 * Loaded from Azure DevOps by the tree loader (`IWorkItemTreeLoader`); kept independent of the raw
 * REST shape so the view renderer never has to parse it, and so a fake loader can mint these
 * directly without matching ADO's wire format.
 */

/** A work item's user field (assignee, creator, last editor). */
export interface TrackedUser {
  displayName: string;
  uniqueName: string | null;
  imageUrl: string | null;
}

/** A work item in the tree hierarchy, carrying its children. */
export interface TrackedWorkItem {
  id: number;
  rev: number;
  type: string;
  title: string;
  state: string;
  assignedTo: TrackedUser | null;
  iterationPath: string | null;
  sprintName: string | null;
  /** ISO 8601 timestamp when the item was created. */
  createdDate: string;
  createdBy: TrackedUser | null;
  /** ISO 8601 timestamp when the item was last changed. */
  changedDate: string;
  changedBy: TrackedUser | null;
  description: string;
  /** ISO 8601 timestamp of the configured ETA field; null when unset or the type has no ETA field. */
  eta: string | null;
  children: TrackedWorkItem[];
}

/** One board column (the team's application state) and the ADO states routed onto it. */
export interface TrackedTypeColumn {
  /** The board-column label shown to the user (the application state). */
  column: string;
  /** The ADO state names routed to this column; states[0] is the primary state written back to ADO. */
  states: string[];
}

/** The type catalog entry for each work item type in the hierarchy (Epic, Feature, Story, Bug, …). */
export interface TypeCatalogEntry {
  name: string;
  color: string;
  icon: string;
  /** The reference name of the date field bound as this type's ETA; null when none. */
  etaField: string | null;
  /** The board columns and their routed ADO states; columns[i].states[0] is the primary state for that column. */
  columns: TrackedTypeColumn[];
}

/** A sprint reference (path + name) for sprint-scoped views. */
export interface SprintRef {
  path: string;
  name: string;
}
