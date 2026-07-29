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
  /**
   * The person's Feature Crew tag, resolved from the project's roster after the tree loads (the ADO
   * tree itself carries no tag). `undefined` = not yet resolved; `null` = resolved but the person has
   * no tag yet (shown as the neutral "??" pill); a string = the assigned crew tag.
   */
  tag?: string | null;
}

/** A work item in the tree hierarchy, carrying its children. */
export interface TrackedWorkItem {
  id: number;
  rev: number;
  type: string;
  title: string;
  state: string;
  /** The numeric Azure DevOps priority, or null when the process does not provide one. */
  priority: number | null;
  assignedTo: TrackedUser | null;
  iterationPath: string | null;
  sprintName: string | null;
  /** ISO 8601 timestamp when the item was created. */
  createdDate: string;
  createdBy: TrackedUser | null;
  /** ISO 8601 timestamp when the item was last changed. */
  changedDate: string;
  changedBy: TrackedUser | null;
  /**
   * ISO 8601 timestamp of the last `System.State` transition, or `""` when ADO returned none.
   * Distinct from `changedDate` on purpose: "how long has this been done?" must not be reset by an
   * unrelated edit (a comment, a re-tag) that leaves the state exactly where it was.
   */
  stateChangeDate: string;
  /**
   * The item's description exactly as Azure DevOps stored it — rich-text HTML or Markdown, never
   * flattened. Rendering (and sanitizing) it is the view's job, via the shared MarkdownText control;
   * stripping the markup here would destroy embedded screenshots and `@`-mentions before anyone saw
   * them.
   */
  description: string;
  /**
   * How many discussion comments the item has, from `System.CommentCount`. Read with the tree so a
   * board can tell "nothing to read" from "something to read" without opening every item's
   * discussion — notes themselves are fetched only when a reader opens one.
   *
   * A TOTAL, not a count within any window: an item with only old comments still reports a positive
   * count, so treat it as "worth opening", not as "has recent notes".
   */
  noteCount: number;
  /**
   * The item's Azure DevOps tags, already split out of the single semicolon-separated field ADO
   * stores them in (see `common/ado/workItemTags`). Kept as a list because every consumer asks
   * "does it carry this tag?" rather than "what does the field say", and re-splitting the raw string
   * at each of those call sites is how two of them end up disagreeing.
   */
  tags: string[];
  /**
   * The manual backlog rank (ADO's stack rank); a LOWER number means more important. Items ADO
   * returned no rank for sort after every ranked one rather than jumping to the top.
   */
  importance: number;
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
