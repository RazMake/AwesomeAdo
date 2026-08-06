import type { TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import { workItemTypeColor } from "../../../common/ado/workItemTypes";
import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";
import { renderNewItemRow } from "../../../common/view-common/control/NewItemRow/NewItemRow";
import { renderSprintSelectField } from "../../../common/view-common/control/SprintPicker/SprintSelectField";

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
  /** Where the sprint list comes from; read when the row opens rather than held by the board. */
  services: EnhancedViewServices;
  /** The iteration used until the sprint list lands, and whenever the team has no sprints at all. */
  defaultIterationPath: string | null;
  /** Creates the project. Resolving `false` keeps the box open with the typed title still in it. */
  onSubmit(title: string, iterationPath: string | null): Promise<boolean>;
  onCancel(): void;
}

/**
 * The catalog's own "add a project" row: the shared inline row, the sprint the project starts in,
 * and the sentence only this surface can write.
 *
 * The stated fields come from the binding and are what make the new project a member of THIS
 * catalog, so the summary names them — a project created without them is one the query would not
 * return, and saying so up front is the only warning the reader gets.
 *
 * The sprint is ASKED rather than stated, because unlike the tag and the area it is not what makes
 * the project belong here: it is a schedule that moves every two weeks, so the only useful default
 * is the one the team is in right now.
 */
export function renderNewProjectRow(options: NewProjectRowOptions): HTMLElement {
  const sprint = renderSprintSelectField(options.doc, {
    classPrefix: "awesomeado-projects__new-sprint",
    // Azure DevOps' own default for a new work item, used until the sprint list lands and whenever
    // the team has no sprints to choose from.
    fallbackPath: options.defaultIterationPath ?? "",
    loadSprintWindow: () => options.services.loadSprintWindow(),
  });
  const row = renderNewItemRow({
    doc: options.doc,
    typeName: options.typeName,
    iconUrl: options.typeEntry?.icon ?? null,
    color: workItemTypeColor(options.typeEntry?.color),
    summary: creationSummary(options),
    fields: sprint.element,
    onSubmit: (title) => options.onSubmit(title, sprint.value() || null),
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
  return `Created as a ${options.typeName} ${parts.join(", ")}.`;
}
