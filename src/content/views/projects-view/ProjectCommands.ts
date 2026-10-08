import type { TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { ProjectQueryLink } from "../../../common/ado/projectQuery";
import { primaryWorkTypes } from "../../../common/ado/workItemTypes";
import type { ItemContextMenuCommand } from "../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import { buildCustomTagCommands } from "../project-tracking/item-commands/CustomTagCommands";
import { buildItemEditingCommands } from "../project-tracking/item-commands/ItemCommands";
import {
  buildNewChildCommand,
  newChildOfferFor,
} from "../project-tracking/item-commands/NewChildCommands";
import { buildProjectLifecycleCommands } from "../project-tracking/item-commands/ProjectLifecycleCommands";
import type { ItemCommandTarget } from "../project-tracking/item-commands/itemCommandCore";

/** Everything the per-project commands need beyond the item itself. */
export interface ProjectCommandsOptions extends ItemCommandTarget {
  /** The bound catalog query, which "Update parent" looks the new parent up against. */
  queryId: string;
  /** The catalog's type entries, so completion can resolve the project type's own final state. */
  types: ReadonlyMap<string, TypeCatalogEntry>;
  /** Every tag worn anywhere in the loaded tree, offered by "Add custom tag". */
  knownTags: readonly string[];
  /**
   * The tags that are the QUERY's own condition, lower-cased. Never offered for removal: taking one
   * off would drop the project out of the very catalog the command was invoked from.
   */
  queryTags: ReadonlySet<string>;
  /** The project's own tracking query, when it already owns one. */
  queryLink: ProjectQueryLink | null;
  /** Whether a null `queryLink` means "owns none" rather than "the read that would find one failed". */
  queryLinkKnown: boolean;
  /** The resolved query folder a new tracking query is created in. */
  queryFolderPath: string;
  /**
   * Whether this row IS a project (a top-level result) rather than work beneath one.
   *
   * Only a project can be retired from the catalog: completing the work under one is something the
   * board that tracks it decides, alongside the rest of that branch. Giving an item its own tracking
   * query is offered at every level.
   */
  isProject: boolean;
  /** Whether the box asking for a new milestone's title is already open under this project. */
  addingChild: boolean;
  /** Opens that box. */
  onAddChild: () => void;
  /**
   * Builds the "Add work item" form for this row, created as `typeName`.
   *
   * Supplied by the view rather than built here because everything the form opens on — which areas
   * the catalog uses, who is offered as an assignee, what creating it then does to the board — is a
   * fact about the loaded catalog, not about the menu.
   */
  newWorkItemPanel: (typeName: string, close: () => void) => HTMLElement;
  /** Reloads the catalog from Azure DevOps after a change the loaded tree cannot represent. */
  onReload: () => void;
}

/**
 * The per-project right-click commands: edit the project, tag it, give it its own tracking query,
 * and retire it.
 *
 * Built here rather than inside the shared menu because the tag commands are facts about THIS
 * catalog's data — which vocabulary is in use, and which tags are the query's own condition. The
 * lifecycle pair is shared with Project Tracking, so "completed" cannot mean one state here and
 * another there.
 */
export function buildProjectCommands(options: ProjectCommandsOptions): ItemContextMenuCommand[] {
  return [
    ...buildItemEditingCommands(options),
    ...buildCustomTagCommands({
      ...options,
      protectedTags: options.queryTags,
      itemKind: "Project",
      noRemovableTagsReason: "This project carries no tag of its own to clear.",
    }),
    ...newChildCommand(options),
    ...buildProjectLifecycleCommands({
      ...options,
      // Offered on every row, not just the projects: a milestone or a phase beneath a project is a
      // body of work somebody reports on in its own right, and requiring it to be promoted to a
      // top-level project first would be a data change made purely to unlock a command.
      offerCreate: true,
      offerComplete: options.isProject,
    }),
  ];
}

/**
 * The row's "add a child" command, decided by exactly the rule Project Tracking uses
 * (`newChildOfferFor`), so a row offers the same command — and creates the same type — on both
 * surfaces regardless of its depth in this tree.
 *
 * Only the editor differs: a Primary-work child opens the full work-item form, because new work needs
 * its area, sprint and assignee up front; a planning child gets the inline title box.
 */
function newChildCommand(options: ProjectCommandsOptions): ItemContextMenuCommand[] {
  const offer = newChildOfferFor(options.item, options.types);
  if (offer === null) return [];
  const type = offer.childType;
  if (!primaryWorkTypes([...options.types.values()]).has(type)) {
    return [
      buildNewChildCommand(offer.label, {
        parent: options.item,
        types: options.types,
        adding: options.addingChild,
        onAdd: options.onAddChild,
      }),
    ];
  }
  return [
    {
      label: offer.label,
      separatorBefore: true,
      // Centred rather than left where the reader right-clicked: this is the one panel here that
      // asks half a dozen questions, and anchored to the pointer it lands somewhere different for
      // every row — shoved around by the corrections that keep it on screen.
      centerPanel: true,
      panel: (close) => options.newWorkItemPanel(type, close),
    },
  ];
}
