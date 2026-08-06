import { orderingPolicyProperty } from "../../../common/ordering/OrderingProperty";
import type { ViewType } from "../../../common/view-common/ViewType";

export { orderingPolicyOf } from "../../../common/ordering/OrderingProperty";

/** The binding key holding the tags a project created from this catalog is born with. */
export const NEW_PROJECT_TAGS_KEY = "newProjectTags";

/** The binding key holding the area path a project created from this catalog is born under. */
export const NEW_PROJECT_AREA_PATH_KEY = "newProjectAreaPath";

/** The binding key holding the tag that makes a work item part of this catalog. */
export const PROJECT_TAG_KEY = "projectTag";

/** The binding key holding the folder where this catalog creates project tracking queries. */
export const PROJECT_QUERY_FOLDER_KEY = "projectQueryFolder";

/**
 * The All Projects Catalog View's configuration: presents every top-level item a query returns as a
 * collapsed "project".
 *
 * The view deliberately declares no windows of its own — it shows what the query returned, so the way
 * to change what appears is to change the query, and a second set of hide-after-N-days rules would
 * only make two views disagree about the same items.
 *
 * The creation properties exist because the catalog can ADD a project and create its tracking query.
 * They are per-query for the same reason the ordering policy is: two catalogs in one project can
 * select on different tags, start work in different paths, and organize their queries separately.
 *
 * The sprint a new project starts in is deliberately NOT one of them: it moves every two weeks,
 * so a stored answer would be stale far more often than it was right. The add-a-project row opens on
 * the team's current sprint and lets the reader pick another there.
 */
export const projectsViewType: ViewType = {
  id: "projects",
  label: "All Projects Catalog View",
  properties: [
    orderingPolicyProperty,
    {
      key: PROJECT_TAG_KEY,
      label: "Tag",
      required: false,
      kind: "text",
      derivedFrom: "query-tag",
      hint: "The tag that makes a work item part of this catalog. Filled in from the tag filter in the Azure DevOps query.",
    },
    {
      key: NEW_PROJECT_AREA_PATH_KEY,
      label: "New project area path",
      required: false,
      kind: "autocomplete",
      suggestions: "area-paths",
      hint: "Full area path a new project is created under. Leave empty to use the project's default area.",
    },
    {
      key: PROJECT_QUERY_FOLDER_KEY,
      label: "Project query folder",
      required: false,
      kind: "autocomplete",
      suggestions: "query-folders",
      derivedFrom: "query-folder",
      hint: "Folder where project tracking queries are created. Filled in with the folder holding the Azure DevOps query.",
    },
  ],
};

/** The catalog tag explicitly configured by this build, or the legacy multi-tag setting. */
export function configuredNewProjectTags(properties: Record<string, string>): string[] {
  const current = (properties[PROJECT_TAG_KEY] ?? "").trim();
  if (current.length > 0) return [current];
  return (properties[NEW_PROJECT_TAGS_KEY] ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/** The area path a new project is created under, or null when the binding names none. */
export function configuredNewProjectAreaPath(properties: Record<string, string>): string | null {
  const value = (properties[NEW_PROJECT_AREA_PATH_KEY] ?? "").trim();
  return value.length > 0 ? value : null;
}

/** The configured tracking-query folder, or the catalog query's own folder. */
export function projectQueryFolderOf(
  properties: Record<string, string>,
  catalogFolder: string,
): string {
  const value = (properties[PROJECT_QUERY_FOLDER_KEY] ?? "").trim();
  return value.length > 0 ? value : catalogFolder;
}
