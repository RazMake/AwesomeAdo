import type { TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import { workItemTypeColor } from "../../../common/ado/workItemTypes";
import { renderNewItemRow } from "../../../common/view-common/control/NewItemRow/NewItemRow";

/** What the "add a project" row needs to describe the item it is about to create. */
export interface NewProjectRowOptions {
  doc: Document;
  /** The type a new project is created as: the first entry in the configured type catalog. */
  typeName: string;
  /** That type's catalog entry, for the icon and colour the finished row will carry. */
  typeEntry: TypeCatalogEntry | undefined;
  /** The tags the project is born with, so the catalog's own query returns it immediately. */
  tags: readonly string[];
  /** The area path it is born under, or null to accept the project's default. */
  areaPath: string | null;
  /** The iteration path it starts in, or null to accept the project's default. */
  iterationPath: string | null;
  /** Creates the project. Resolving `false` keeps the box open with the typed title still in it. */
  onSubmit(title: string): Promise<boolean>;
  onCancel(): void;
}

/**
 * The catalog's own "add a project" row: the shared inline row, plus the sentence only this surface
 * can write.
 *
 * The stated fields come from the binding and are what make the new project a member of THIS
 * catalog, so the summary names them — a project created without them is one the query would not
 * return, and saying so up front is the only warning the reader gets.
 */
export function renderNewProjectRow(options: NewProjectRowOptions): HTMLElement {
  const row = renderNewItemRow({
    doc: options.doc,
    typeName: options.typeName,
    iconUrl: options.typeEntry?.icon ?? null,
    color: workItemTypeColor(options.typeEntry?.color),
    summary: creationSummary(options),
    onSubmit: options.onSubmit,
    onCancel: options.onCancel,
  });
  row.classList.add("awesomeado-projects__new");
  return row;
}

/** The one line stating everything about the new project the reader is not being asked to type. */
function creationSummary(options: NewProjectRowOptions): string {
  const parts = [
    options.tags.length > 0
      ? `tagged ${options.tags.join(", ")}`
      : "with no tag — this query may not return it",
  ];
  if (options.areaPath !== null) {
    parts.push(`under ${options.areaPath}`);
  }
  if (options.iterationPath !== null) {
    parts.push(`in iteration ${options.iterationPath}`);
  }
  return `Created as a ${options.typeName} ${parts.join(", ")}.`;
}
