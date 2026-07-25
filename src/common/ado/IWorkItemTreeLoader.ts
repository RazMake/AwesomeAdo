import type { TrackedWorkItem } from "./TrackedWorkItem";

/** One folder in a query's ancestor trail: the label to show and the full path to link to. */
export interface QueryFolderCrumb {
  /** The folder's own name (its display label), not the full path. */
  label: string;
  /**
   * The folder's full path from the query root, root container included (e.g.
   * "Shared Queries/Team A/Reports"). ADO addresses a folder by its whole ancestry, so building the
   * folder link needs the path, not just the label.
   */
  path: string;
}

/**
 * The result of loading a query's work-item tree.
 *
 * `isTreeQuery: false` means the query is flat (a direct list), so the loader returned nothing; a
 * tree-driven view should then show a "not a tree query" message. `error` is set when the fetch or
 * parse failed; the view should render the error instead of an empty tree.
 */
export interface WorkItemTreeResult {
  isTreeQuery: boolean;
  roots: TrackedWorkItem[];
  error: string | null;
  /**
   * The query's ancestor-folder trail (outermost → nearest), for the view's breadcrumb — the two
   * nearest folders only (parent + grandparent). The real loader always populates it (empty when the
   * query sits directly under a root or its location could not be read); test fakes may omit it, so
   * consumers treat `undefined` as an empty trail.
   */
  folderPath?: QueryFolderCrumb[];
}

/**
 * Loads a tree query's work items, normalizing them into the `TrackedWorkItem` hierarchy.
 *
 * The real implementation fetches from Azure DevOps; a test fake can return canned data; a
 * placeholder (Phase 1) returns an empty tree + a "coming soon" message.
 */
export interface IWorkItemTreeLoader {
  loadTree(queryId: string): Promise<WorkItemTreeResult>;
}
