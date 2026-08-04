import type { ItemContextMenuCommand } from "../../../common/view-common/control/ItemContextMenu/ItemContextMenu";

/** What the catalog-wide menu needs to know about the board it was opened from. */
export interface ProjectsTitleCommandOptions {
  /**
   * The type a new project is created as: the FIRST entry in the configured type catalog.
   *
   * The top of that list is the process's outermost type by construction, which is exactly what a
   * project is here. Null when nothing is configured yet — the command then says so instead of
   * creating an item of a type Azure DevOps would refuse.
   */
  projectType: string | null;
  /** Whether the add-a-project row is already open, so the command cannot re-open it. */
  adding: boolean;
  onAddProject(): void;
}

/**
 * The commands the catalog's own title offers, beneath "Copy ADO Url".
 *
 * Built here rather than inside the shared menu because what "add a project" means is a fact about
 * THIS catalog — which type sits at the top of the configured hierarchy, and whether the row that
 * asks for a title is already on screen. The menu only shows them.
 */
export function buildProjectsTitleCommands(
  options: ProjectsTitleCommandOptions,
): ItemContextMenuCommand[] {
  return [
    {
      label: "Add new project",
      separatorBefore: true,
      disabledReason: addProjectRefusal(options),
      run: options.onAddProject,
    },
  ];
}

/** Why the command cannot run right now, or null when it can. */
function addProjectRefusal(options: ProjectsTitleCommandOptions): string | null {
  if (options.projectType === null) {
    return "No work item types are configured. Set them under Options → Azure DevOps.";
  }
  return options.adding ? "The new project row is already open above the list." : null;
}
