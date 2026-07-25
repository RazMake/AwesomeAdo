import type { TrackedWorkItem } from "./TrackedWorkItem";

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
