import type { TrackedWorkItem, TypeCatalogEntry } from "../../../../common/ado/TrackedWorkItem";
import type { ProjectQueryLink } from "../../../../common/ado/projectQuery";
import {
  renderConfirmPanel,
  type ConfirmChoice,
} from "../../../../common/view-common/control/ConfirmPanel/ConfirmPanel";
import type { ItemContextMenuCommand } from "../../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import { projectTrackingViewType } from "../projectTrackingViewType";

import { panelFor, writeField, type ItemCommandTarget } from "./itemCommandCore";

/** The Azure DevOps field holding an item's workflow state. */
const STATE_FIELD = "System.State";

/** How wide the confirmation the destructive command asks for opens. */
const CONFIRM_WIDTH_PX = 380;

/** Everything the project-lifecycle commands need beyond the item itself. */
export interface ProjectLifecycleOptions extends ItemCommandTarget {
  /** The configured type catalog, so completion can resolve this type's own final state. */
  types: ReadonlyMap<string, TypeCatalogEntry>;
  /** The project's tracking query when it already owns one; null when it has none. */
  queryLink: ProjectQueryLink | null;
  /**
   * Whether a null `queryLink` means "this project has none" rather than "the read that would have
   * found one failed".
   *
   * Completion cannot delete a query it cannot name, so the difference has to reach the reader: a
   * project retired on the strength of "nothing to clean up" would otherwise leave its query, its
   * link and its binding behind with nobody told.
   */
  queryLinkKnown: boolean;
  /** The query folder a new tracking query is created in. */
  queryFolderPath: string;
  /**
   * Whether "Create Project Query" is offered at all.
   *
   * The Project Tracking board IS a project's query, so offering to make it another one there would
   * only ever produce a duplicate; the catalog, where a project may have none, offers it.
   */
  offerCreate: boolean;
  /** Re-read the surface after a change that altered which projects or queries exist. */
  onReload: () => void;
}

/**
 * The two commands that govern a project's life outside its own fields: giving it a tracking query,
 * and retiring it.
 *
 * Shared by the catalog (where a project is a row) and by Project Tracking (where it is the board's
 * root), because they are the same operations on the same thing. Keeping them in one place is what
 * stops "completed" from meaning one state on one surface and another state next door.
 */
export function buildProjectLifecycleCommands(
  options: ProjectLifecycleOptions,
): ItemContextMenuCommand[] {
  const commands: ItemContextMenuCommand[] = [];
  if (options.offerCreate) {
    commands.push(createProjectQueryCommand(options));
  }
  commands.push({ ...markCompletedCommand(options), separatorBefore: commands.length === 0 });
  return commands;
}

/**
 * Gives the project its own saved tracking query and binds that query to the Project Tracking view.
 *
 * Disabled once the project owns one, rather than hidden: a menu whose commands come and go between
 * rows is harder to use than one whose commands stay put and say why they cannot run. A second query
 * is also not an undo — it would leave the first one linked and bound with nothing pointing at it.
 * An unread link disables it for the same reason: creating a second query for a project that may
 * already have one is the mistake this command exists to prevent.
 */
function createProjectQueryCommand(options: ProjectLifecycleOptions): ItemContextMenuCommand {
  return {
    label: "Create Project Query",
    separatorBefore: true,
    disabledReason: createQueryRefusal(options),
    run: () => void createProjectQuery(options),
  };
}

/** Why a tracking query cannot be created right now, or null when it can. */
function createQueryRefusal(options: ProjectLifecycleOptions): string | null {
  if (options.queryLink !== null) {
    return "This project already has a tracking query linked.";
  }
  return options.queryLinkKnown
    ? null
    : "Azure DevOps could not be asked whether this project already has a tracking query. Refresh and try again.";
}

/**
 * Retires the project, and offers to take its tracking query with it.
 *
 * The query is a separate question and is therefore asked rather than assumed: a completed project's
 * query is usually clutter, but a team that reports on finished work would lose that report with no
 * way to get it back. Answering "Complete" alone leaves the query exactly as it was.
 */
function markCompletedCommand(options: ProjectLifecycleOptions): ItemContextMenuCommand {
  const finalState = completionStateOf(options);
  return {
    label: "Mark completed",
    disabledReason:
      finalState === null
        ? `No board column is configured for "${options.item.type}", so its completed state is unknown.`
        : null,
    panel: (close) => completionPanel(options, finalState ?? "", close),
  };
}

/**
 * The state a completed project lands in: the primary ADO state of its type's LAST board column.
 *
 * Read from the configured type catalog rather than named here, because "completed" is the TEAM's
 * word: one process calls it Closed, the next Done, and a third routes both onto one column. The
 * last column is the end of the team's own workflow by construction.
 */
export function completionStateOf(options: {
  item: TrackedWorkItem;
  types: ReadonlyMap<string, TypeCatalogEntry>;
}): string | null {
  const columns = options.types.get(options.item.type)?.columns ?? [];
  return columns[columns.length - 1]?.states[0] ?? null;
}

/** The confirmation: what completing does, and the one decision only the user can make. */
function completionPanel(
  options: ProjectLifecycleOptions,
  finalState: string,
  close: () => void,
): HTMLElement {
  const { doc } = options;
  const complete = (deleteQuery: boolean): void => {
    close();
    void completeProject(options, finalState, deleteQuery);
  };
  const body = renderConfirmPanel(doc, {
    summary: `This project will be set to "${finalState}".`,
    detail: cleanupDetail(options),
    choices: cleanupChoices(options, complete),
    onCancel: close,
  });
  body.classList.add("awesomeado-project-complete");
  return panelFor(doc, options.item, { withTitle: true, widthPx: CONFIRM_WIDTH_PX }, [body]);
}

/**
 * The tracking query completion may delete, or null when there is none it may touch.
 *
 * A query somebody saved and linked by hand still counts as the project's tracking query — that is
 * what stops this command's twin offering to create a second one — but deleting it belongs to
 * whoever made it.
 */
function deletableQueryOf(options: ProjectLifecycleOptions): ProjectQueryLink | null {
  const link = options.queryLink;
  return link !== null && link.managed ? link : null;
}

/** What completing will do about the project's tracking query. */
function cleanupDetail(options: ProjectLifecycleOptions): string {
  if (deletableQueryOf(options) !== null) {
    return "Delete its tracking query as well? The query, its link and the AwesomeADO binding all go.";
  }
  if (options.queryLink !== null) {
    return "Its tracking query was linked outside AwesomeADO, so it is left untouched.";
  }
  return options.queryLinkKnown
    ? "It has no tracking query to clean up."
    : "Azure DevOps could not be asked which tracking query this project owns, so completing it now " +
        "leaves any query, link and binding behind. Refresh and try again to remove them too.";
}

/** The affirmative answers: cleanup is offered only when there is a query the command may delete. */
function cleanupChoices(
  options: ProjectLifecycleOptions,
  complete: (deleteQuery: boolean) => void,
): ConfirmChoice[] {
  return deletableQueryOf(options) === null
    ? [{ label: "Complete", primary: true, onChoose: () => complete(false) }]
    : [
        { label: "Complete and delete query", primary: true, onChoose: () => complete(true) },
        { label: "Complete", onChoose: () => complete(false) },
      ];
}

/**
 * Create the project's query, link it, then bind it — each step only once the previous one landed.
 *
 * The binding is written last and deliberately not rolled back on its own failure: the query exists
 * and is reachable from the project either way, so the worst case is a query whose enhanced view has
 * to be enabled by hand, rather than an invisible one nobody can find.
 */
async function createProjectQuery(options: ProjectLifecycleOptions): Promise<void> {
  const { item, services } = options;
  const result = await services.projectQueries.create({
    projectId: item.id,
    projectTitle: item.title,
    rev: item.rev,
    folderPath: options.queryFolderPath,
  });
  if (!result.ok || result.queryId === undefined) {
    return;
  }
  if (result.rev !== undefined) {
    item.rev = result.rev;
  }
  await services.queryBindings.bind(result.queryId, {
    view: projectTrackingViewType.id,
    properties: {},
    name: item.title,
  });
  services.logger.info(
    `Project ${item.id} now has tracking query ${result.queryId}, bound to ${projectTrackingViewType.id}.`,
  );
  options.onReload();
}

/**
 * Complete the project, then — only if asked — unlink and delete its query and drop the binding.
 *
 * The state change goes first because it is the command's actual subject: a completion that landed
 * but whose cleanup failed is a correct and recoverable outcome, whereas a query deleted for a
 * project that was never completed is not.
 */
async function completeProject(
  options: ProjectLifecycleOptions,
  finalState: string,
  deleteQuery: boolean,
): Promise<void> {
  const { item, services } = options;
  const previousState = item.state;
  const written = await writeField(options, {
    field: STATE_FIELD,
    value: finalState,
    baseValue: previousState,
  });
  if (!written) return;
  item.state = finalState;
  services.logger.info(
    `Project ${item.id} marked completed: state ${previousState}→${finalState}, ` +
      `deleteQuery=${String(deleteQuery)}.`,
  );
  const link = deletableQueryOf(options);
  if (deleteQuery && link !== null) {
    await deleteProjectQuery(options, link);
  }
  options.onReload();
}

/** Unlink and delete the tracking query, then forget the binding that pointed at it. */
async function deleteProjectQuery(
  options: ProjectLifecycleOptions,
  link: ProjectQueryLink,
): Promise<void> {
  const { item, services } = options;
  const removed = await services.projectQueries.remove({
    projectId: item.id,
    queryId: link.queryId,
    // The item's own current rev, not the one the link was read at: the completion above advanced it.
    rev: item.rev,
  });
  if (!removed.ok) return;
  if (removed.rev !== undefined) {
    item.rev = removed.rev;
  }
  // Dropped only after the query is actually gone: a binding removed first would leave the query
  // without its enhanced view if the delete then failed — the harder state to notice and repair.
  await services.queryBindings.unbind(link.queryId);
  services.logger.info(`Removed the AwesomeADO binding for deleted query ${link.queryId}.`);
}
