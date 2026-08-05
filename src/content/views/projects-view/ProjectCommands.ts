import type { TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { ProjectQueryLink } from "../../../common/ado/projectQuery";
import {
  formatWorkItemTags,
  withWorkItemTag,
  withoutWorkItemTag,
} from "../../../common/ado/workItemTags";
import type { ItemContextMenuCommand } from "../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import { renderTextEditor } from "../../../common/view-common/control/TextEditor/TextEditor";
import { buildItemEditingCommands } from "../project-tracking/item-commands/ItemCommands";
import {
  buildNewChildCommand,
  primaryChildTypeOf,
} from "../project-tracking/item-commands/NewChildCommands";
import { buildProjectLifecycleCommands } from "../project-tracking/item-commands/ProjectLifecycleCommands";
import {
  EDITOR_WIDTH_PX,
  panelFor,
  writeField,
  type ItemCommandTarget,
} from "../project-tracking/item-commands/itemCommandCore";

/** The Azure DevOps field holding an item's tags, as one semicolon-separated string. */
const TAGS_FIELD = "System.Tags";

/** How far back "View all notes" reaches on this catalog: the item's whole discussion. */
const ALL_NOTES_SINCE = new Date(0).toISOString();

/** Everything the per-project commands need beyond the item itself. */
export interface ProjectCommandsOptions extends ItemCommandTarget {
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
    ...buildItemEditingCommands({ ...options, notesSinceIso: ALL_NOTES_SINCE }),
    { ...addTagCommand(options), separatorBefore: true },
    clearTagCommand(options),
    ...newMilestoneCommand(options),
    ...newWorkItemCommand(options),
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
 * Adds the project's next milestone, the same command Project Tracking offers on its own title.
 *
 * Offered on the projects only, not on the work beneath them: the level under a project is what this
 * catalog reports on, while planning inside a milestone is a decision made on the board that tracks
 * that project alongside the rest of its branch.
 */
function newMilestoneCommand(options: ProjectCommandsOptions): ItemContextMenuCommand[] {
  if (!options.isProject) return [];
  return [
    buildNewChildCommand("Add new milestone/phase", {
      parent: options.item,
      types: options.types,
      adding: options.addingChild,
      onAdd: options.onAddChild,
    }),
  ];
}

/**
 * Raises a new piece of work under the LOWEST planning level — the row whose configured children are
 * the delivery the team tracks.
 *
 * Offered only there because that is the only level where "new work" means work: on an item whose
 * children are more planning it would quietly create structure, and beneath the delivery level it
 * would create implementation detail nobody asked for.
 */
function newWorkItemCommand(options: ProjectCommandsOptions): ItemContextMenuCommand[] {
  const type = primaryChildTypeOf(options.item, options.types);
  if (type === null) return [];
  return [
    {
      label: "Add work item",
      separatorBefore: true,
      // Centred rather than left where the reader right-clicked: this is the one panel here that
      // asks half a dozen questions, and anchored to the pointer it lands somewhere different for
      // every row — shoved around by the corrections that keep it on screen.
      centerPanel: true,
      panel: (close) => options.newWorkItemPanel(type, close),
    },
  ];
}

/**
 * Adds a tag, offering the ones already in use on this catalog before asking anyone to type.
 *
 * Completing against the tree's own vocabulary is the point: a team's tags are spelled
 * inconsistently the moment two people type them, and Azure DevOps treats "Security" and "security"
 * as one tag while showing whichever spelling arrived first. Offering the existing spellings is what
 * keeps the catalog's filter from splitting one concept into two half-answers.
 */
function addTagCommand(options: ProjectCommandsOptions): ItemContextMenuCommand {
  return {
    label: "Add custom tag",
    submenu: () => {
      const worn = new Set(options.item.tags.map((tag) => tag.trim().toLowerCase()));
      const offered = options.knownTags.filter((tag) => !worn.has(tag.toLowerCase()));
      return [
        {
          label: "New tag…",
          separatorBefore: offered.length > 0,
          panel: (close) => newTagPanel(options, close),
        },
        ...offered.map((tag) => ({
          label: tag,
          run: () => void applyTag(options, tag),
        })),
      ];
    },
  };
}

/** The box a tag nobody has used yet is typed into. */
function newTagPanel(options: ProjectCommandsOptions, close: () => void): HTMLElement {
  return panelFor(options.doc, options.item, { withTitle: true, widthPx: EDITOR_WIDTH_PX }, [
    renderTextEditor(options.doc, {
      initialText: "",
      submitLabel: "Add",
      singleLine: true,
      placeholder: "New tag",
      onSubmit: async (text) => {
        const written = await applyTag(options, text);
        if (written) close();
        return written;
      },
      onCancel: close,
    }),
  ]);
}

/**
 * Removes one of the project's own tags.
 *
 * The query's condition tags are left out entirely rather than shown disabled: this command exists
 * to tidy a project's labels, and the tag that keeps it in the catalog is not a label — removing it
 * would make the project vanish from the surface the user is standing on.
 */
function clearTagCommand(options: ProjectCommandsOptions): ItemContextMenuCommand {
  const removable = (): string[] =>
    options.item.tags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0 && !options.queryTags.has(tag.toLowerCase()));
  return {
    label: "Clear custom tag",
    disabledReason:
      removable().length === 0 ? "This project carries no tag of its own to clear." : null,
    submenu: () =>
      removable().map((tag) => ({
        label: tag,
        run: () => void removeTag(options, tag),
      })),
  };
}

/** Persist a derived tag list, folding it back onto the item only once ADO has accepted it. */
async function setTags(options: ProjectCommandsOptions, next: string[]): Promise<boolean> {
  const written = await writeField(options, {
    field: TAGS_FIELD,
    value: formatWorkItemTags(next),
    // The list was DERIVED from the tags the item wore, so naming them lets the write survive a rev
    // the catalog never saw advance while still refusing a concurrent change to the tags themselves.
    baseValue: formatWorkItemTags(options.item.tags),
  });
  if (written) {
    options.item.tags = next;
    options.onChanged();
  }
  return written;
}

async function applyTag(options: ProjectCommandsOptions, tag: string): Promise<boolean> {
  const trimmed = tag.trim();
  if (trimmed.length === 0) return false;
  const written = await setTags(options, withWorkItemTag(options.item.tags, trimmed));
  if (written) {
    options.services.logger.info(
      `Project ${options.item.id} tagged "${trimmed}"; it now carries ${options.item.tags.length} tag(s).`,
    );
  }
  return written;
}

async function removeTag(options: ProjectCommandsOptions, tag: string): Promise<void> {
  if (await setTags(options, withoutWorkItemTag(options.item.tags, tag))) {
    options.services.logger.info(
      `Project ${options.item.id} untagged "${tag}"; it now carries ${options.item.tags.length} tag(s).`,
    );
  }
}
