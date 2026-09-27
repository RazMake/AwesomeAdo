import type { QueryFolderCrumb } from "../../../ado/IWorkItemTreeLoader";
import { buildQueryFolderUrl } from "../../../ado/fetchAdoTree";

import type { BreadcrumbSegment } from "./Breadcrumbs";

/**
 * A query's parent-folder trail as breadcrumb segments, each linking to that folder in ADO's query
 * hub.
 *
 * The page's own URL supplies the org/project the links resolve against; when it is not a
 * recognizable ADO location a segment stays plain text rather than pointing at a fabricated URL.
 */
export function queryFolderBreadcrumbs(
  folderPath: readonly QueryFolderCrumb[] | undefined,
  href: string,
): BreadcrumbSegment[] {
  return (folderPath ?? []).map((folder) => {
    const url = buildQueryFolderUrl(href, folder.path);
    return url === null ? { label: folder.label } : { label: folder.label, url };
  });
}
