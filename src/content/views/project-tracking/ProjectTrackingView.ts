import {
  applyFeatureCrewTags,
  assignedTagKey,
  assignedTagsOf,
  collectAssignedDirectoryUsers,
  collectAssignedTags,
  collectFeatureCrewAssignees,
  deriveAlias,
  type FeatureCrewAssignee,
  type FeatureCrewMember,
  type FeatureCrewTagAssignment,
} from "../../../common/ado/FeatureCrew";
import type { DirectoryUser } from "../../../common/ado/IUserDirectory";
import type { QueryFolderCrumb, WorkItemTreeResult } from "../../../common/ado/IWorkItemTreeLoader";
import type {
  TrackedUser,
  TrackedWorkItem,
  TypeCatalogEntry,
} from "../../../common/ado/TrackedWorkItem";
import { noteWindowStart } from "../../../common/ado/WorkItemNote";
import { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { buildQueryFolderUrl, buildWorkItemUrl } from "../../../common/ado/fetchAdoTree";
import type { SprintWindow } from "../../../common/ado/sprintWindow";
import {
  boardColumnOrdinal,
  flattenWorkItems,
  orderTrackedItems,
  primaryWorkAncestors,
  primaryWorkWithAncestors,
  workItemIdsVisibleUnderPrimaryFilter,
  workItemsEligibleForPrimaryFilter,
  workItemStatusLabel,
  workItemTypeColor,
} from "../../../common/ado/workItemTypes";
import { resolveMentionsIn } from "../../../common/browser/MessagingMentionDirectory";
import { isoEpoch } from "../../../common/datetime/isoEpoch";
import { MANUAL_ORDERING_POLICY, type OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import type { WorkItemMarker } from "../../../common/settings/ExtensionSettings";
import type {
  DataDrivenViewContext,
  EnhancedView,
  EnhancedViewContext,
  EnhancedViewServices,
} from "../../../common/view-common/EnhancedView";
import { renderActivityFilterPills } from "../../../common/view-common/control/ActivityFilter/ActivityFilterPanel";
import { RecentNotesIndex } from "../../../common/view-common/control/ActivityFilter/RecentNotesIndex";
import {
  activityFilterInForce,
  matchesRecentActivity,
  recentWindowStart,
  type RecentActivityKind,
} from "../../../common/view-common/control/ActivityFilter/recentActivity";
import {
  renderAreaPathFilter,
  type AreaPathFilterHandle,
} from "../../../common/view-common/control/AreaPathFilter/AreaPathFilter";
import {
  renderAssignedTo,
  type AssignedToHandle,
} from "../../../common/view-common/control/AssignedTo/AssignedTo";
import {
  renderChildItemsBadge,
  type ChildItemDescriptor,
} from "../../../common/view-common/control/ChildItemsBadge/ChildItemsBadge";
import {
  collectRolledUpDescendants,
  type RolledUpDescendant,
} from "../../../common/view-common/control/ChildItemsBadge/rolledUpDescendants";
import {
  DragReorderController,
  type PlannedMove,
} from "../../../common/view-common/control/DragReorder/DragReorderController";
import { renderEmptyState } from "../../../common/view-common/control/EmptyState/EmptyState";
import {
  renderEtaBadge,
  type EtaBadgeHandle,
} from "../../../common/view-common/control/EtaBadge/EtaBadge";
import { renderFilterPillFamilies } from "../../../common/view-common/control/FilterPill/FilterPill";
import {
  createItemContextMenu,
  type ItemContextMenu,
  type ItemContextMenuTarget,
} from "../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import {
  renderItemDetailsButton,
  renderItemDetailsContent,
} from "../../../common/view-common/control/ItemDetails/ItemDetails";
import {
  renderItemTypeIcon,
  type ItemTypeIconEmphasis,
} from "../../../common/view-common/control/ItemTypeIcon/ItemTypeIcon";
import { renderMarkerFilterPills } from "../../../common/view-common/control/MarkerPill/MarkerFilterPills";
import {
  collectMarkersInUse,
  createMarkerFilter,
  itemHasMarker,
} from "../../../common/view-common/control/MarkerPill/markerPresence";
import { renderNewItemRow } from "../../../common/view-common/control/NewItemRow/NewItemRow";
import { renderOrderingPicker } from "../../../common/view-common/control/OrderingPicker/OrderingPicker";
import {
  renderPriorityBadge,
  type PriorityBadgeHandle,
} from "../../../common/view-common/control/PriorityBadge/PriorityBadge";
import {
  createRowEmphasisStyle,
  modifierHighlightTracker,
  restripeVisibleRows,
  type RowEmphasisClasses,
} from "../../../common/view-common/control/RowEmphasis/RowEmphasis";
import {
  renderSprintPicker,
  type SprintPickerHandle,
} from "../../../common/view-common/control/SprintPicker/SprintPicker";
import { renderStatusBadge } from "../../../common/view-common/control/StatusBadge/StatusBadge";
import { renderViewScaffold } from "../../../common/view-common/control/ViewScaffold/ViewScaffold";
import { renderWriteQueueStatus } from "../../../common/view-common/control/WriteQueueStatus/WriteQueueStatus";
import { createPopupHost } from "../../../common/view-common/control/popupHost/popupHost";
import {
  loadInterruptAcceptanceState,
  type InterruptAcceptanceState,
} from "../interrupt-acceptance/interruptAcceptanceState";
import { writeItemAssignee } from "../item-assignee/writeItemAssignee";
import { writeItemEta } from "../item-eta/writeItemEta";
import { writeItemPriority } from "../item-priority/writeItemPriority";

import { applyMoveToTree, applyRanksToTree } from "./drag-reorder/applyMoveToTree";
import {
  renderProjectTrackingHeader,
  type RefreshButtonHandle,
} from "./header/ProjectTrackingHeader";
import { buildItemCommands, buildSprintMoveCommands } from "./item-commands/ItemCommands";
import { buildMarkerCommands } from "./item-commands/MarkerCommands";
import {
  buildNewChildCommand,
  childTypeOf,
  isImmediateParentOfPrimaryWork,
  newChildItem,
  newChildSummary,
} from "./item-commands/NewChildCommands";
import { buildProjectLifecycleCommands } from "./item-commands/ProjectLifecycleCommands";
import { renderMarkerReasonsPill } from "./marker-reasons/MarkerReasonsPill";
import { createNotesPanelState, renderNotesPanel, type NotesPanelState } from "./notes/NotesPanel";
import { markerCommentPrefixes } from "./notes/markerNotes";
import {
  hideResolvedAfterDays,
  orderingPolicyOf,
  projectTrackingViewType,
  recentChangesWindowHours,
  updatesWindowWeeks,
} from "./projectTrackingViewType";
import { renderTagFilterPills } from "./tag-filter/TagFilterPanel";

/** The hex color of a work item type, or null when the type is unknown or carries no color. */
function typeColorOf(typeName: string, typeMap: Map<string, TypeCatalogEntry>): string | null {
  return workItemTypeColor(typeMap.get(typeName)?.color);
}

/**
 * The hex color of the LAST configured work item type — the bottom of the hierarchy — or null when
 * no type is configured or that type carries no color. Kept apart from `typeColorOf` because the
 * rollup badge is keyed off the hierarchy's position, not off any particular item's own type.
 */
function lastTypeColor(types: TypeCatalogEntry[]): string | null {
  return workItemTypeColor(types[types.length - 1]?.color);
}

/**
 * Maps a work item's ADO State (System.State) to the application Status — the board-column label it
 * is routed onto. Falls back to the raw ADO State when the type declares no matching column, so an
 * unmapped state is still shown rather than blanked.
 */
const statusLabelOf = workItemStatusLabel;

/**
 * Everything one render pass narrows the tree by, bundled so the recursive visibility test and the
 * rollup badge apply exactly the same rules and can never fall out of step.
 */
interface TreeFilter {
  /** The sprint the board is filtered to, or null when the sprint filter is off. */
  sprint: string | null;
  /** Full Azure DevOps area paths selected in the header (empty = every area). */
  areaPaths: ReadonlySet<string>;
  /** The active Feature Crew tag filter (empty = nobody selected); `null` is the untagged "??" bucket. */
  tags: Set<string | null>;
  /** True once an item has sat in the resolved column longer than the binding's window allows. */
  isResolvedPastWindow(item: TrackedWorkItem): boolean;
  /** True when the item passes the recent-activity pills (no pill lit passes everything). */
  matchesRecentActivity(item: TrackedWorkItem): boolean;
  /** True when the item passes the marker pills (no pill lit passes everything). */
  matchesMarkers(item: TrackedWorkItem): boolean;
}

/**
 * Does this item match the pills that are lit?
 *
 * The pills form three independent GROUPS — the Feature Crew tags, the recent-activity pills, and
 * the marker (blocked / blocked by another team) pills — and the rule is deliberately different
 * within a group than between them: pills inside a group are OR'd, and the groups are AND'd. So
 * "(any selected tag) AND (any selected activity) AND (any selected marker)": lighting a second tag
 * WIDENS the board, while lighting an activity or marker pill on top of a tag NARROWS it to that
 * person's recent or blocked work. A group with nothing lit imposes nothing, which is what makes "no
 * pills lit" mean "no narrowing" rather than "hide everything".
 *
 * Note this is deliberately NOT what the reference PowerShell board does — it ORs every pill
 * together, which lets an activity pill drag in items belonging to people the reader explicitly
 * filtered out.
 */
function matchesLitPills(item: TrackedWorkItem, filter: TreeFilter): boolean {
  const key = assignedTagKey(item);
  const matchesTags = filter.tags.size === 0 || (key !== undefined && filter.tags.has(key));
  // The activity and marker halves already answer `true` for every item when nothing in their group
  // is lit, so the "an unlit group imposes nothing" rule needs no second check for either here.
  return matchesTags && filter.matchesRecentActivity(item) && filter.matchesMarkers(item);
}

/**
 * The same filters, minus the sprint, for an item nobody scheduled.
 *
 * A milestone holding no delivery yet sits outside every sprint — teams leave it on the project's
 * own iteration — so testing it against the sprint the board is on would hide every milestone that
 * has not been filled, including the one just created to be filled.
 */
function unscheduledFilter(filter: TreeFilter): TreeFilter {
  return { ...filter, sprint: null };
}

/** Whether one filterable work item passes every active filter group. */
function matchesTreeFilter(item: TrackedWorkItem, filter: TreeFilter): boolean {
  const matchesSprint = !filter.sprint || item.sprintName === filter.sprint;
  const matchesAreaPath =
    filter.areaPaths.size === 0 || (item.areaPath !== null && filter.areaPaths.has(item.areaPath));
  return (
    matchesSprint &&
    matchesAreaPath &&
    matchesLitPills(item, filter) &&
    !filter.isResolvedPastWindow(item)
  );
}

/**
 * Renders the description panel (initially hidden) for a work item row.
 * Returns the panel element plus the toggle button that controls its visibility.
 */
function renderDescription(
  doc: Document,
  item: TrackedWorkItem,
  typeColor: string | null,
  mentionNames: ReadonlyMap<string, string>,
): { panel: HTMLElement; toggleButton: HTMLButtonElement; expansion: ExpansionControl } {
  const hasDescription = item.description.trim().length > 0;
  const toggleButton = renderItemDetailsButton(doc, {
    hasDescription,
    typeColor,
    className: "awesomeado-tracking__describe",
  });

  const panel = doc.createElement("div");
  panel.className = "awesomeado-tracking__description";
  panel.style.cssText = "display:none;margin-top:8px;padding-left:39px";
  const content = renderItemDetailsContent(doc, item, mentionNames);
  content
    .querySelector(".awesomeado-item-details__meta")
    ?.classList.add("awesomeado-tracking__meta");
  content
    .querySelector(".awesomeado-item-details__description")
    ?.classList.add("awesomeado-tracking__desc-text");
  panel.append(content);

  const setExpanded = (expanded: boolean): void => {
    toggleButton.setExpanded(expanded);
    panel.style.display = expanded ? "block" : "none";
  };
  setExpanded(false);

  toggleButton.addEventListener("click", () => {
    setExpanded(toggleButton.getAttribute("aria-expanded") !== "true");
  });

  return {
    panel,
    toggleButton,
    expansion: {
      isExpanded: () => toggleButton.getAttribute("aria-expanded") === "true",
      setExpanded,
    },
  };
}

/**
 * The character length of the widest Status label the whole board can show — every selectable column
 * label across all types plus each item's displayed status. Feeding this to every badge as a shared
 * `minWidthCh` makes all badges render one uniform width regardless of their individual type's labels.
 */
function widestStatusLabelLength(
  root: TrackedWorkItem,
  typeMap: Map<string, TypeCatalogEntry>,
): number {
  let widest = 0;
  // Any column can be picked from the dropdown, so all their labels must fit the shared width.
  for (const entry of typeMap.values()) {
    for (const column of entry.columns) {
      widest = Math.max(widest, column.column.length);
    }
  }
  // Plus every displayed status — covers items whose state maps to no column (raw-state fallback).
  const pending = [...root.children];
  while (pending.length > 0) {
    const item = pending.pop()!;
    widest = Math.max(widest, statusLabelOf(item, typeMap.get(item.type)).length);
    pending.push(...item.children);
  }
  return widest;
}

/**
 * The tag-editing capability wired into each assignee pill: the tags already in use (offered as
 * quick-pick choices) plus a hook that persists the chosen/added tag onto the Feature Crew roster.
 */
interface AssigneeTagEditor {
  /** The distinct Feature Crew tags currently worn across the board, in first-seen order. */
  tagsInUse(): string[];
  /** Record the chosen or newly-added tag for the given assignee (writes the roster, then refreshes). */
  assign(user: TrackedUser, tag: string): void;
}

/**
 * Everything an assignee chip needs to offer people and to persist the pick, bundled so the tree
 * rows, the rolled-up children and the header's Tech Lead all build the chip exactly the same way.
 */
interface AssigneeChipContext {
  doc: Document;
  services: EnhancedViewServices;
  /** The board's single serialized field-write queue, shared with the status and ETA edits. */
  queue: WorkItemWriteQueue;
  /**
   * The people offered before anything is typed — everyone already assigned across this project,
   * each carrying the crew tag the picker shows beside their name.
   */
  crew(): TrackedUser[];
  /** Records a picked person on the Feature Crew roster (a no-op when they are already on it). */
  onPicked(user: DirectoryUser): void;
  /** Tag editing for the chip's pill; null leaves the pill read-only. */
  tagEditor: AssigneeTagEditor | null;
}

/**
 * Builds an item's assignee chip, wired to persist a pick back to Azure DevOps.
 *
 * Persist-then-reflect, exactly like the status and ETA controls: picking someone enqueues a
 * serialized write of `System.AssignedTo` and the chip only shows the new name once ADO accepts it,
 * so a rejected write never leaves a name on the board that was never saved. The board's shared
 * write-status indicator reports the loss, so there is nothing to roll back here.
 *
 * The rev is read at WRITE time (not at pick time), so a second edit queued behind this one still
 * carries a current rev. The picked person is also handed to the Feature Crew roster, which adds
 * anyone new so their tag pill can be edited straight away.
 */
function createItemAssignee(
  item: TrackedWorkItem,
  chipContext: AssigneeChipContext,
  showTag: boolean,
): AssignedToHandle {
  const { doc, services, queue, crew, onPicked, tagEditor } = chipContext;
  // The onChange closure needs the handle to reflect a committed change, but the handle only exists
  // after renderAssignedTo returns. A ref cell breaks that cycle with a single const binding: the
  // closure runs only on a later user pick, by which point `chip.handle` is set.
  const chip: { handle?: AssignedToHandle } = {};
  const control = renderAssignedTo(doc, {
    user: item.assignedTo,
    userDirectory: services.userDirectory,
    suggestions: crew,
    onChange: (picked) => {
      writeItemAssignee(item, picked, queue, (assigned) => {
        chip.handle?.setUser(assigned);
        onPicked(picked);
      });
    },
    showTag,
    assignableTags: tagEditor ? tagEditor.tagsInUse() : undefined,
    // Bound to the ITEM, not to the person assigned when the chip was built: after a reassignment
    // the same chip must tag whoever is on the item NOW, not the person it replaced.
    onTagChange: tagEditor
      ? (tag) => {
          if (item.assignedTo !== null) {
            tagEditor.assign(item.assignedTo, tag);
          }
        }
      : undefined,
  });
  chip.handle = control;
  return control;
}

/**
 * Everything the tree renderer holds constant for one pass over the tree, bundled so the recursive
 * render functions take a depth and an item rather than a dozen positional arguments that every
 * intermediate function would otherwise have to forward verbatim.
 */
interface TreeRenderOptions {
  doc: Document;
  context: DataDrivenViewContext;
  typeMap: Map<string, TypeCatalogEntry>;
  /** The board's single serialized field-write queue, shared by status and ETA edits. */
  queue: WorkItemWriteQueue;
  /** The shared status-badge width so every badge on the board renders one uniform size. */
  statusWidthCh: number;
  /** The team's global board columns in order; a status colors by its position in this list. */
  boardColumns: string[];
  /** Work items retained after Primary-work filtering and hierarchy expansion. */
  visibleItemIds: ReadonlySet<number>;
  /** How the items within each level are ordered, straight from the binding. */
  orderingPolicy: OrderingPolicy;
  showSprintPills: boolean;
  /** How every assignee chip on this pass offers people and persists a pick. */
  chip: AssigneeChipContext;
  /**
   * The board's single right-click menu, shared by every row this pass renders (and by the rolled-up
   * children inside them). One instance rather than one per row, because only one menu can be open.
   */
  contextMenu: ItemContextMenu;
  /** The team's sprint window, so an item's menu can offer the sprints it may move to. */
  sprintWindow: SprintWindow;
  /** The same full paths offered by the header's area-path filter. */
  areaPaths: readonly string[];
  /** Interrupt ids accepted during their current tagged lifetime. */
  interruptAcceptedIds: ReadonlySet<number>;
  /**
   * Repaints the board after a menu command changed what a row shows — the FILTER ROW as well as the
   * tree, because a command can change which pills exist at all (flagging an item is what makes its
   * marker pill appear, and clearing the last one is what takes it away).
   */
  repaint: () => void;
  /** Collects every expandable row rendered in this pass so expand-all/collapse-all can drive them. */
  expandableRows: ExpandableRow[];
  /** Collects each notes toggle so the header controls can open or close row discussions. */
  noteExpansions: ExpansionControl[];
  /** Collects each description toggle so collapse-all can close row details before the outline. */
  descriptionExpansions: ExpansionControl[];
  /**
   * The rows the user has collapsed, by work item id.
   *
   * The board repaints on far more than a reload — a drag-reorder, a re-sort, a filter change — and
   * each pass builds brand-new elements, so without this every one of those would spring the whole
   * outline back open under the reader. Collapsed ids (rather than expanded ones) are remembered
   * because expanded is the default: a row that appears later is then open like every other new row.
   */
  collapsedIds: Set<number>;
  /**
   * The rows whose notes panel the user has opened, by work item id. Remembered (unlike the
   * collapsed branches, which record the exception) because closed is the default here: a panel
   * fetches on first open, so a row that appears later must not start by firing a request nobody
   * asked for.
   */
  expandedNoteIds: Set<number>;
  /** Loaded discussion data retained when filter/order repaints replace a row's DOM. */
  notePanelStates: Map<number, NotesPanelState>;
  /**
   * ISO 8601 start of the binding's Updates window — the oldest note any panel on this pass will
   * fetch. Computed per pass, not per board, so a board left open overnight moves its window with
   * the clock instead of re-reading yesterday's fortnight.
   */
  notesSinceIso: string;
  /**
   * Display names for the `@`-mention GUIDs in the descriptions this pass renders, keyed by
   * lowercase GUID.
   *
   * Read from the directory ONCE per pass rather than per row: rendering is synchronous, so a row
   * needs a map in hand, and re-reading it per row would let two descriptions in the same pass
   * disagree about who someone is. A name the directory learns later lands on the next repaint.
   */
  mentionNames: ReadonlyMap<string, string>;
  /** The color the rolled-up child badge tints from; null leaves it a neutral chip. */
  minorChildColor: string | null;
  /** Primary-work types and every planning-context type on a path above them. */
  treeRowTypes: ReadonlySet<string>;
  /** The board's "add a child under this item" affordance, shared by every row and by the root. */
  newChild: NewChildSurface;
  /** Consumes the one rolled-up child popup that should reopen after its successful reorder. */
  reopenMinorChildPopup: (parentId: number) => boolean;
  /** Reassigns zebra stripes after a branch changes which rows are visible. */
  restripeRows: () => void;
  /**
   * Registers each row for drag-to-reorder, or null when reordering is unavailable this pass (any
   * ordering other than importance, or no configured team to rank against). Null is what leaves the
   * titles with a normal cursor and no drag handlers at all, rather than a handle that silently
   * refuses every drop.
   */
  dragReorder: DragReorderController | null;
}

/**
 * One expandable row from a render pass: the twisty plus the item it belongs to.
 *
 * The id travels with the button because expand-all/collapse-all must record what it did, and a
 * button alone cannot say which work item it opened or closed.
 */
interface ExpandableRow {
  id: number;
  twisty: HTMLButtonElement;
}

/** A row detail surface that the row itself and the board-wide controls can drive consistently. */
interface ExpansionControl {
  isExpanded(): boolean;
  setExpanded(expanded: boolean): void;
}

/** Legacy row depth used only for configurations saved before Primary work classification existed. */
const MAX_ROW_DEPTH = 1;
const ITEM_WRAPPER_CLASS = "awesomeado-tracking__item";
const ITEM_SURFACE_CLASS = "awesomeado-tracking__item-surface";
const CHILDREN_CLASS = "awesomeado-tracking__children";

/** The board's own DOM, named for the shared stripe/hover/emphasis treatment. */
const ROW_EMPHASIS_CLASSES: RowEmphasisClasses = {
  wrapper: ITEM_WRAPPER_CLASS,
  surface: ITEM_SURFACE_CLASS,
  children: CHILDREN_CLASS,
};

/**
 * Half the former row padding trails the whole surface instead, preserving item height while leaving
 * breathing room below whichever description or notes section is last.
 */
const ITEM_SURFACE_EXTRA_CSS = "padding-bottom: 4px;";

/**
 * How far the "completed" board column sits from the end of the board order. The last column is the
 * abandoned bucket (Removed), so the one before it (Done) is what "completed" means for a rollup —
 * an abandoned child is not work that got finished.
 */
const COMPLETED_COLUMN_FROM_END = 2;

/** Milliseconds in a day, the unit the "hide resolved after" window is configured in. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The horizontal breathing room on each side of the board, in pixels.
 *
 * Applied at BOTH nesting levels (the view root and the board inside it), so the real inset is twice
 * this. Kept deliberately tight: this view replaces ADO's own page, and every pixel spent on an
 * outer margin is a pixel a wrapped item title cannot use — on a dense tree board, wider rows buy
 * far more than symmetrical whitespace does. Named once so the two levels cannot drift apart.
 */
const BOARD_EDGE_PADDING_PX = 6;

/**
 * The board-column position that means "this item is finished": the column before the abandoned
 * bucket. Returns -1 when the board declares too few columns for that position to exist, which is
 * also what `boardColumnOrdinal` answers for an unmapped status — so callers must reject a negative
 * ordinal rather than let every unmapped item read as finished.
 */
function completedColumnOrdinal(boardColumns: string[]): number {
  return boardColumns.length - COMPLETED_COLUMN_FROM_END;
}

/**
 * The board-column position a reopened item lands on.
 *
 * Positional like every other board-column decision here: the five columns are fixed and only their
 * titles belong to the team, so position 1 always means "someone is working on it" whatever they
 * named it. Reopening onto the queue instead would throw away the fact that the item had already
 * been picked up once.
 */
const ACTIVE_COLUMN_ORDINAL = 1;

/**
 * Whether an item's status sits on the board's completed column.
 *
 * Both `completedColumnOrdinal` and `boardColumnOrdinal` answer -1 — for a board too short to name a
 * completed column, and for a status mapped to no column at all — so a negative target is rejected
 * rather than letting every unmapped item read as finished.
 */
function isCompleted(
  item: TrackedWorkItem,
  typeMap: Map<string, TypeCatalogEntry>,
  boardColumns: string[],
): boolean {
  const completedOrdinal = completedColumnOrdinal(boardColumns);
  if (completedOrdinal < 0) {
    return false;
  }
  const status = statusLabelOf(item, typeMap.get(item.type));
  return boardColumnOrdinal(status, boardColumns) === completedOrdinal;
}

/**
 * Builds the "matches the recent-activity pills" test for one render pass.
 *
 * Rebuilt per pass for the same reason the resolved-age test is: the window is rolling, so a board
 * left open must age items out of "newly" on its next repaint rather than keep answering against the
 * hour it loaded on. The notes half is delegated to the index, which is the only thing that knows
 * whether the discussions have actually been read yet.
 */
function createRecentActivityFilter(
  properties: Record<string, string>,
  now: Date,
  selected: ReadonlySet<RecentActivityKind>,
  recentNotes: RecentNotesIndex,
): (item: TrackedWorkItem) => boolean {
  // Named before the criteria rather than inlined twice: the index stores WHEN each item was last
  // commented on, so it has to be tested against the very same window start the other two pills use.
  // Two separately-computed "now"s would let an item pass one pill and fail another in one pass.
  const sinceMs = recentWindowStart(now, recentChangesWindowHours(properties));
  const criteria = {
    selected: activityFilterInForce(selected, recentNotes.isPending()),
    sinceMs,
    hasRecentNote: (item: TrackedWorkItem) => recentNotes.hasRecentNote(item, sinceMs),
  };
  return (item) => matchesRecentActivity(item, criteria);
}

/**
 * Builds the "resolved long enough to drop off the board" test for one render pass.
 *
 * "Resolved" is a position, not a state name: whatever the team routed onto the column before the
 * abandoned bucket. The age is measured from the item's last STATE change, so re-reading or
 * re-tagging a finished item does not put it back on the board for another few days.
 */
function createResolvedWindowFilter(
  typeMap: Map<string, TypeCatalogEntry>,
  boardColumns: string[],
  hideAfterDays: number,
  now: Date,
): (item: TrackedWorkItem) => boolean {
  const resolvedOrdinal = completedColumnOrdinal(boardColumns);
  if (resolvedOrdinal < 0) {
    // Too few columns to name a resolved one; hiding on a position that does not exist would blank
    // every item whose status maps nowhere.
    return () => false;
  }
  const cutoff = now.getTime() - hideAfterDays * MS_PER_DAY;
  return (item) => {
    if (!isCompleted(item, typeMap, boardColumns)) {
      return false;
    }
    const resolvedAt = isoEpoch(item.stateChangeDate);
    // An item ADO returned no state-change date for cannot be aged out: keep showing it rather than
    // hiding finished work on a date this build does not actually have.
    return resolvedAt !== null && resolvedAt < cutoff;
  };
}

/** Marks the span that owns the triangle, so its own (small) font size survives every state flip. */
const TWISTY_GLYPH_CLASS = "awesomeado-tracking__twisty-glyph";
/** Text-presentation selector (U+FE0E) keeps the triangles monochrome glyphs instead of emoji. */
const TWISTY_GLYPH_EXPANDED = "\u25BC\uFE0E";
const TWISTY_GLYPH_COLLAPSED = "\u25B6\uFE0E";

/**
 * Applies one twisty's expanded/collapsed state to the button and its children container.
 *
 * The triangle is written THROUGH the inner glyph span, never onto the button itself: assigning the
 * button's own textContent replaces that span, and the triangle then inherits the button's much
 * larger font size for the rest of the session.
 */
function setTwistyExpanded(
  twisty: HTMLElement,
  childrenContainer: HTMLElement | null,
  expanded: boolean,
): void {
  twisty.setAttribute("aria-expanded", expanded ? "true" : "false");
  const glyph = twisty.querySelector<HTMLElement>(`.${TWISTY_GLYPH_CLASS}`);
  if (glyph) {
    glyph.textContent = expanded ? TWISTY_GLYPH_EXPANDED : TWISTY_GLYPH_COLLAPSED;
  }
  if (childrenContainer) {
    childrenContainer.style.display = expanded ? "block" : "none";
  }
}

/** Locates the children container of the row a twisty belongs to (null when the row has none). */
function childrenContainerOf(twisty: HTMLElement): HTMLElement | null {
  const rowWrapper = twisty.closest<HTMLElement>(`.${ITEM_WRAPPER_CLASS}`);
  const container = rowWrapper?.querySelector(`:scope > .${CHILDREN_CLASS}`);
  return container instanceof HTMLElement ? container : null;
}

/** Create the priority chip and reflect a new value only after Azure DevOps accepts the write. */
function createPriorityBadge(
  item: TrackedWorkItem,
  options: TreeRenderOptions,
): PriorityBadgeHandle {
  const badge = renderPriorityBadge(options.doc, {
    priority: item.priority,
    onChange: (priority) => {
      writeItemPriority(item, priority, options.queue, (committed) => badge.setPriority(committed));
    },
  });
  badge.style.verticalAlign = "middle";
  badge.style.marginRight = "3px";
  return badge;
}

/**
 * Creates the row controls: the fixed tree gutter plus editable status and priority badges.
 * The gutter is a rigid flex child on the row; the status badge flows inline at the head of the
 * content block (with the title, ? and assignee) so those four read as one line that wraps together.
 *
 * A row whose children are rolled up into a badge gets no twisty — there are no child rows to
 * expand, so offering the affordance would promise an outline that does not exist.
 */
function createRowControls(
  item: TrackedWorkItem,
  options: TreeRenderOptions,
  showsChildRows: boolean,
): {
  gutter: HTMLElement;
  stateBadge: HTMLElement;
  priorityBadge: PriorityBadgeHandle;
  twisty: HTMLButtonElement | null;
} {
  const { doc, typeMap, queue, statusWidthCh, boardColumns } = options;
  let twisty: HTMLButtonElement | null = null;
  let gutter: HTMLElement;

  if (showsChildRows && item.children.length > 0) {
    twisty = doc.createElement("button");
    twisty.className = "awesomeado-tracking__twisty";
    twisty.type = "button";
    twisty.setAttribute("aria-expanded", "true");
    // Bare twisty: only the triangle glyph is visible — no border, no background — so the tree reads
    // as a clean outline. The button box is one full content line tall (1.8em of the inherited font,
    // matching the content block's line-height) and centers its glyph, so the triangle lines up with
    // the vertical center of the row's FIRST line for both single-line and wrapped rows. Keep the
    // fixed width so it lines up with the leaf-row spacer.
    twisty.style.cssText = [
      "cursor:pointer",
      "border:none",
      "background:none",
      "padding:0",
      "width:20px",
      "flex:0 0 20px",
      "height:1.8em",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "color:var(--text-primary-color)",
    ].join(";");
    // The glyph is deliberately small; it lives in its own span so the button box can stay a full
    // line tall (for centering) without enlarging the triangle.
    const twistyGlyph = doc.createElement("span");
    twistyGlyph.className = TWISTY_GLYPH_CLASS;
    twistyGlyph.textContent = TWISTY_GLYPH_EXPANDED;
    twistyGlyph.style.cssText = "font-size:8px;line-height:1";
    twisty.append(twistyGlyph);
    gutter = twisty;
  } else {
    const spacer = doc.createElement("span");
    // Fixed 20px gutter that must NOT shrink: as a flex child it would otherwise collapse toward its
    // 0 min-content on an overflowing (long-title) row, dragging that row's status badge left out of
    // alignment with the other rows.
    spacer.style.cssText = "flex:0 0 20px";
    gutter = spacer;
  }

  const entry = typeMap.get(item.type);
  const columns = (entry?.columns ?? [])
    .filter((c) => c.states.length > 0)
    .map((c) => ({
      column: c.column,
      primaryState: c.states[0] ?? c.column,
      ordinal: boardColumnOrdinal(c.column, boardColumns),
    }));

  const statusLabel = statusLabelOf(item, entry);
  const stateBadge = renderStatusBadge(doc, {
    // Show the application Status (the mapped board-column label), never the raw ADO State.
    state: statusLabel,
    ordinal: boardColumnOrdinal(statusLabel, boardColumns),
    columns,
    editable: true,
    minWidthCh: statusWidthCh,
    onChange: (primaryState, column) => {
      // Persist first, then reflect the committed Status: the badge label only moves once the write
      // succeeds, so a rejected write never leaves a value on screen that ADO did not accept. The
      // rev is read at WRITE time (not here), so a second edit queued behind this one still carries
      // a current rev. The queue logs and counts failures and never rejects, so there is nothing to
      // roll back — the board's write-status indicator reports the loss.
      queue
        .enqueue({
          id: item.id,
          currentRev: () => item.rev,
          field: "System.State",
          value: primaryState,
        })
        .then((result) => {
          if (result.ok && result.rev !== undefined) {
            item.state = primaryState;
            item.rev = result.rev;
            item.stateChangeDate = options.context.services.now().toISOString();
            // Reflect the new Status label and re-tint to its board-column ordinal so the badge's
            // color tracks the label (the badge owns its own coloring). Repaint as well because ETA
            // color and resolved-age visibility both depend on the item's completion transition.
            stateBadge.setStatus(column, boardColumnOrdinal(column, boardColumns));
            options.repaint();
          }
        });
    },
  });
  // The badge flows inline at the head of the content block, so it sits on the same line as the
  // title/?/assignee and wraps together with them; middle-align it to the text line and give it a
  // little breathing room before the title.
  stateBadge.style.verticalAlign = "middle";
  stateBadge.style.marginRight = "2px";

  return { gutter, stateBadge, priorityBadge: createPriorityBadge(item, options), twisty };
}

/**
 * Creates the row title and description controls.
 */
function createTitleControls(
  doc: Document,
  item: TrackedWorkItem,
  typeMap: Map<string, TypeCatalogEntry>,
  mentionNames: ReadonlyMap<string, string>,
): {
  titleSpan: HTMLElement;
  descButton: HTMLButtonElement;
  descPanel: HTMLElement;
  descriptionExpansion: ExpansionControl;
} {
  const titleSpan = doc.createElement("span");
  titleSpan.className = "awesomeado-tracking__item-title";
  titleSpan.textContent = item.title;
  // Break long, unspaced tokens so an over-long title wraps instead of forcing a horizontal scroll.
  // Middle-aligned like every other control on the line: left on the baseline it sat low against the
  // ? disc, the type icon and the assignee, which are all atomic inline boxes centred on the text.
  titleSpan.style.cssText = "font-weight:500;overflow-wrap:anywhere;vertical-align:middle";
  const itemColor = typeColorOf(item.type, typeMap);
  if (itemColor) {
    titleSpan.style.color = itemColor;
  }

  const {
    panel: descPanel,
    toggleButton: descButton,
    expansion: descriptionExpansion,
  } = renderDescription(doc, item, itemColor, mentionNames);
  // The ? disc leads the row's controls, ahead of the type icon and the title, so every row's disc
  // sits in the same column instead of at whatever point that row's title happens to end on.
  // vertical-align:middle keeps it centered on the text line.
  descButton.style.display = "inline-flex";
  descButton.style.verticalAlign = "middle";
  descButton.style.margin = "0 4px";

  return { titleSpan, descButton, descPanel, descriptionExpansion };
}

/**
 * Builds the row's type icon and the notes panel it opens.
 *
 * The icon IS the affordance: it sits in front of the title showing what kind of item this is, and
 * doubles as the item's Updates toggle. It carries three states, so the board can be read without
 * clicking anything: **grey** when the item has no discussion at all, the type's **color dimmed**
 * when there is something to read, and **full color** while it is open. One glyph doing all three
 * keeps a dense row from growing yet another control, and makes "where are the notes?" answerable by
 * scanning the left edge.
 *
 * The grey state is seeded from the item's total comment count (which arrives with the tree, so it
 * costs nothing) and then CORRECTED once a panel has actually read its window — a total counts old
 * comments the window excludes, so an item can start out promising notes and settle to grey.
 *
 * Expanded panels are remembered across repaints for the same reason collapsed branches are: the
 * board rebuilds its rows on every filter change, drag and re-sort, and a panel the reader opened
 * must not shut behind them.
 */
function createItemNotes(
  item: TrackedWorkItem,
  options: TreeRenderOptions,
): { toggle: HTMLElement; panel: HTMLElement; expansion: ExpansionControl } {
  const { doc, typeMap, context } = options;
  const services = context.services;
  const startsExpanded = options.expandedNoteIds.has(item.id);
  // Seeded from the tree's comment count, then replaced by what a panel actually read. Held on the
  // ITEM (not just in this closure) so the answer survives the repaint that discards these elements.
  let hasNotes = item.noteCount > 0;

  const icon = renderItemTypeIcon(doc, {
    iconUrl: typeMap.get(item.type)?.icon ?? null,
    color: typeColorOf(item.type, typeMap),
    typeName: item.type,
    // The toggle below owns the tooltip: the icon IS the notes affordance here, so hovering it must
    // say what clicking does, not repeat the work item type.
    title: "",
    emphasis: contentEmphasis(startsExpanded, hasNotes),
  });

  const toggle = doc.createElement("button");
  toggle.className = "awesomeado-tracking__notes-toggle";
  toggle.type = "button";
  // A bare button: only the icon is visible, so the row still reads as "icon, then title".
  toggle.style.cssText = [
    "cursor:pointer",
    "border:none",
    "background:none",
    "padding:0",
    "display:inline-flex",
    "align-items:center",
    "vertical-align:middle",
    "font:inherit",
    "color:inherit",
  ].join(";");
  toggle.append(icon.element);

  let panelState = options.notePanelStates.get(item.id);
  if (panelState === undefined) {
    panelState = createNotesPanelState();
    options.notePanelStates.set(item.id, panelState);
  }
  const notes = renderNotesPanel({
    doc,
    workItemId: item.id,
    sinceIso: options.notesSinceIso,
    services,
    state: panelState,
    // A note is a work item revision: without this the row's status, assignee and ETA controls would
    // all be writing against a rev the reader's own note had already superseded.
    onItemRevision: (rev) => {
      item.rev = rev;
    },
    onNoteCountKnown: (count) => {
      hasNotes = count > 0;
      // Written back to the model so a later repaint seeds from the truth rather than from ADO's
      // total again — otherwise an item whose notes all fall outside the window would flick back to
      // "has notes" on every re-sort.
      item.noteCount = count;
      icon.setEmphasis(contentEmphasis(toggle.getAttribute("aria-expanded") === "true", hasNotes));
    },
  });

  const setExpanded = (expanded: boolean): void => {
    if (expanded) {
      options.expandedNoteIds.add(item.id);
    } else {
      options.expandedNoteIds.delete(item.id);
    }
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.title = notesToggleTitle(expanded);
    icon.setEmphasis(contentEmphasis(expanded, hasNotes));
    notes.setExpanded(expanded);
  };
  setExpanded(startsExpanded);

  toggle.addEventListener("click", () => {
    setExpanded(toggle.getAttribute("aria-expanded") !== "true");
  });

  return {
    toggle,
    panel: notes.element,
    expansion: {
      isExpanded: () => toggle.getAttribute("aria-expanded") === "true",
      setExpanded,
    },
  };
}

/**
 * How loudly a row's leading control renders: it carries the type's color only when there is
 * something behind it, and comes to full strength only while the reader has it open.
 *
 * Shared by the type icon (notes) and the description disc so the two can never drift apart on what
 * a given shade means. Keeping "is there anything here?" separate from "are you looking at it?" is
 * what lets an empty item open without borrowing a color that would promise content it does not have.
 */
function contentEmphasis(expanded: boolean, hasContent: boolean): ItemTypeIconEmphasis {
  return { colored: hasContent, loud: expanded };
}

/**
 * The toggle's tooltip: what pressing it does, nothing more. The icon is the row's only affordance
 * for its notes, so the tooltip is spent naming the action rather than repeating the work item type
 * (which the icon itself shows) or the shade's "has notes" answer.
 */
function notesToggleTitle(expanded: boolean): string {
  return expanded ? "Hide notes" : "Show notes";
}

/**
 * Whether an item sits on a real, leaf sprint worth badging. An item parked on the iteration ROOT
 * (a single top-level node — e.g. just the project/team name) is not assigned to an actual sprint;
 * its "sprint" is only the root of the iteration tree, so it gets no pill. Only a nested (leaf)
 * iteration is a genuine sprint. ADO iteration paths are backslash-separated, so a leaf has 2+
 * segments.
 */
function isLeafSprint(item: TrackedWorkItem): boolean {
  return (
    item.sprintName !== null && item.iterationPath !== null && item.iterationPath.includes("\\")
  );
}

/**
 * Builds an item's ETA badge, wired to persist edits when the item's type has an ETA field
 * configured. Shared by the tree rows and the header (root) so ETA read/write lives in one place.
 *
 * The badge is editable ONLY when the type declares an ETA field to write to; without one it is a
 * read-only "No ETA". Picking a date or clearing enqueues a serialized field write against that
 * type's configured field and reflects the committed value on success — so a failed write never
 * leaves a misleading date on screen (persist-then-reflect, matching the status badge).
 */
function createItemEtaBadge(
  doc: Document,
  item: TrackedWorkItem,
  typeMap: Map<string, TypeCatalogEntry>,
  boardColumns: string[],
  queue: WorkItemWriteQueue,
  now: Date,
): EtaBadgeHandle {
  const etaField = typeMap.get(item.type)?.etaField ?? null;
  // The onChange closure needs the badge handle to reflect a committed change, but the handle only
  // exists after renderEtaBadge returns. A ref cell breaks that cycle with a single const binding:
  // the closure runs only on a later user pick, by which point `badge.handle` is set.
  const badge: { handle?: EtaBadgeHandle } = {};
  const onChange = etaField
    ? (newEta: string | null): void => {
        writeItemEta(item, newEta, etaField, queue, (committed) => badge.handle?.setEta(committed));
      }
    : undefined;
  const completion = isCompleted(item, typeMap, boardColumns)
    ? { completedAt: item.stateChangeDate || null }
    : {};
  badge.handle = renderEtaBadge(doc, { eta: item.eta, now, onChange, ...completion });
  return badge.handle;
}

/**
 * The ADO state that moves an item onto a given board column: the primary state of the type's column
 * at that position, or null when the type routes nothing there.
 *
 * A team is free to leave a column unmapped for a type, and an unmapped column has no state to
 * write — so the caller has to be told "there is nowhere to move this to" rather than be handed a
 * guess that would park the item somewhere the team never configured.
 */
function primaryStateForOrdinal(
  item: TrackedWorkItem,
  typeMap: Map<string, TypeCatalogEntry>,
  boardColumns: string[],
  ordinal: number,
): string | null {
  const columns = typeMap.get(item.type)?.columns ?? [];
  const target = columns.find((c) => boardColumnOrdinal(c.column, boardColumns) === ordinal);
  return target?.states[0] ?? null;
}

/**
 * Persists a rolled-up child's completion tick, resolving with the completion that ACTUALLY
 * committed — so a rejected write leaves the checkbox where ADO still has it instead of showing a
 * change nobody accepted. Completion before the click is `!next`, which is what every unsuccessful
 * path reports back.
 */
function toggleMinorChildDone(
  child: TrackedWorkItem,
  options: TreeRenderOptions,
  next: boolean,
): Promise<boolean> {
  const { typeMap, boardColumns, queue, context } = options;
  const ordinal = next ? completedColumnOrdinal(boardColumns) : ACTIVE_COLUMN_ORDINAL;
  const target = primaryStateForOrdinal(child, typeMap, boardColumns, ordinal);
  if (target === null) {
    // Clicked, but this type routes no state onto that column, so there is nothing to write and the
    // tick has to stay put. Logged with the signals that decided it: without them the log would say
    // only that a click did nothing.
    context.services.logger.info(
      `Child ${child.id} (${child.type}) completion unchanged: no state routed to board column ${ordinal}`,
    );
    return Promise.resolve(!next);
  }
  return queue
    .enqueue({ id: child.id, currentRev: () => child.rev, field: "System.State", value: target })
    .then((result) => {
      // The queue logs and counts its own failures and never rejects, so a lost write needs no
      // rollback here — reporting the completion ADO still holds is the whole correction.
      if (!result.ok || result.rev === undefined) {
        return !next;
      }
      child.state = target;
      child.rev = result.rev;
      child.stateChangeDate = options.context.services.now().toISOString();
      return next;
    });
}

/**
 * The ADO deep link for one item.
 *
 * The view runs on the ADO query page, so the page's own address supplies the org/project the link
 * resolves against; an address that names neither leaves every affordance built on it inert rather
 * than pointing somewhere that does not exist.
 */
function itemUrl(doc: Document, id: number): string | null {
  return buildWorkItemUrl(doc.location?.href ?? "", id);
}

/**
 * The oldest note any surface on this board will read, from the binding's Updates window.
 *
 * Computed on demand rather than once per board: "the last N weeks" moves with the clock, so a board
 * left open overnight must not keep fetching against the window it opened on.
 */
function boardNotesSince(context: DataDrivenViewContext): string {
  return noteWindowStart(context.services.now(), updatesWindowWeeks(context.properties));
}

/**
 * The board's one "add a child under this item" affordance.
 *
 * One surface rather than a handler per caller because the board allows exactly one open box at a
 * time: the title's menu and every row's menu are asking the same question, and two boxes on screen
 * would leave it ambiguous which list a typed title is being added to.
 */
interface NewChildSurface {
  /** Whether the box asking for a title is already open under `parent`. */
  isOpen(parent: TrackedWorkItem): boolean;
  /** Opens it under `parent`, closing whichever one was open, and repaints. */
  open(parent: TrackedWorkItem): void;
  /** The box itself when it belongs under `parent`; null otherwise. */
  row(parent: TrackedWorkItem): HTMLElement | null;
}

/** What creating one child under a board item needs beyond the parent and the typed title. */
interface NewChildContext {
  doc: Document;
  root: TrackedWorkItem;
  context: DataDrivenViewContext;
  typeMap: Map<string, TypeCatalogEntry>;
  session: BoardSession;
  queue: WorkItemWriteQueue;
  repaint: () => void;
}

/** Builds the board's single add-a-child surface over the session that remembers what is open. */
function createNewChildSurface(ctx: NewChildContext): NewChildSurface {
  const { session } = ctx;
  return {
    isOpen: (parent) => session.addingChildOf === parent.id,
    open: (parent) => {
      session.addingChildOf = parent.id;
      // A collapsed branch would hide the very box that was just asked for, and the reader has no
      // way to connect the missing box to the twisty they closed earlier.
      session.collapsedIds.delete(parent.id);
      ctx.repaint();
    },
    row: (parent) => (session.addingChildOf === parent.id ? newChildRow(parent, ctx) : null),
  };
}

/** The inline box asking for the new child's title, wired to this board's configuration. */
function newChildRow(parent: TrackedWorkItem, ctx: NewChildContext): HTMLElement | null {
  const type = childTypeOf(parent, ctx.typeMap);
  if (type === null) return null;
  const entry = ctx.typeMap.get(type);
  return renderNewItemRow({
    doc: ctx.doc,
    typeName: type,
    iconUrl: entry?.icon ?? null,
    color: workItemTypeColor(entry?.color),
    summary: newChildSummary(parent, type),
    onSubmit: (title) => addChildItem(parent, type, title, ctx),
    onCancel: () => {
      ctx.session.addingChildOf = null;
      ctx.repaint();
    },
  });
}

/**
 * Creates the child the reader typed a title for and shows it at the top of its level.
 *
 * Spliced into the loaded tree rather than re-read: the query that built this board returns the
 * whole project, so the new item is already inside it by construction, and a reload would throw away
 * everything the reader had open to learn something already known.
 */
async function addChildItem(
  parent: TrackedWorkItem,
  type: string,
  title: string,
  ctx: NewChildContext,
): Promise<boolean> {
  const { services } = ctx.context;
  const result = await services.createWorkItem.create({
    type,
    title,
    tags: [],
    // Inherited, not asked: work identified under an item belongs to the same area and sprint as the
    // item it was identified from until someone deliberately moves it.
    areaPath: parent.areaPath,
    iterationPath: parent.iterationPath,
    parentId: parent.id,
  });
  if (!result.ok || result.id === undefined) return false;
  const siblingIds = orderTrackedItems(
    parent.children,
    (child) => child,
    MANUAL_ORDERING_POLICY,
  ).map((child) => child.id);
  const created = newChildItem({
    id: result.id,
    rev: result.rev ?? 1,
    fields: result.fields,
    type,
    title,
    parent,
    types: ctx.typeMap,
    createdAt: services.now().toISOString(),
  });
  parent.children.unshift(created);
  ctx.session.addingChildOf = null;
  ctx.session.addedIds.add(created.id);
  services.logger.info(
    `Project Tracking added ${type} ${created.id} under ${parent.id}, ahead of ${siblingIds.length} sibling(s).`,
  );
  ctx.repaint();
  rankChildFirst(created, parent, siblingIds, ctx);
  return true;
}

/**
 * Persists the new item's place at the top of its level.
 *
 * Written even when the board is showing a derived order: the backlog rank is a property of the
 * item, not of what this reader is currently sorted by, and leaving it unset would drop the item to
 * the bottom of the list the moment anyone opened it under the manual order.
 */
function rankChildFirst(
  created: TrackedWorkItem,
  parent: TrackedWorkItem,
  siblingIds: readonly number[],
  ctx: NewChildContext,
): void {
  const team = ctx.context.services.currentTeam();
  if (team === null) {
    ctx.context.services.logger.info(
      `Left ${created.id} at the top of its level for this session only: no team is configured, ` +
        "and backlog rank is per team in Azure DevOps.",
    );
    return;
  }
  void ctx.queue
    .enqueueReorder({
      id: created.id,
      currentRev: () => created.rev,
      parentId: parent.id,
      // Born under the parent already, so only the rank is written; the link patch is skipped.
      currentParentId: parent.id,
      previousId: 0,
      nextId: siblingIds[0] ?? 0,
      siblingIds: [created.id, ...siblingIds],
      team,
    })
    .then((result) => {
      if (result.rev !== undefined) created.rev = result.rev;
      if (result.order !== undefined) created.importance = result.order;
      if (result.ranks !== undefined) applyRanksToTree(ctx.root, result.ranks);
      ctx.repaint();
    });
}

/**
 * What the right-click menu acts on for one item: how to name it in Azure DevOps, and the commands
 * that change it.
 *
 * Built per open rather than per pass, because the commands close over the item's CURRENT values
 * (the title an editor opens on, the sprint the destinations exclude) and a board left open changes
 * under them.
 */
function menuTargetFor(params: {
  doc: Document;
  item: TrackedWorkItem;
  context: DataDrivenViewContext;
  queue: WorkItemWriteQueue;
  sprintWindow: SprintWindow;
  areaPaths: readonly string[];
  onChanged: () => void;
}): ItemContextMenuTarget {
  const { doc, item, context } = params;
  const target = {
    doc,
    item,
    services: context.services,
    queue: params.queue,
    onChanged: params.onChanged,
  };
  return {
    id: item.id,
    url: itemUrl(doc, item.id),
    commands: [
      ...buildItemCommands({
        ...target,
        sprintWindow: params.sprintWindow,
        areaPaths: params.areaPaths,
        notesSinceIso: boardNotesSince(context),
      }),
      // Asked for explicitly, under their own rule: this board is where a team tracks what is stuck,
      // so it is the board that turns the shared menu's flagging commands on. A view with no such
      // notion simply never asks for them.
      ...buildMarkerCommands(target),
    ],
  };
}

/** The menu target for an item rendered by the tree, drawn from the current pass's options. */
function itemMenuTarget(item: TrackedWorkItem, options: TreeRenderOptions): ItemContextMenuTarget {
  const target = menuTargetFor({
    doc: options.doc,
    item,
    context: options.context,
    queue: options.queue,
    sprintWindow: options.sprintWindow,
    areaPaths: options.areaPaths,
    onChanged: options.repaint,
  });
  // Offered only on the level that actually holds the team's delivery: adding "new work" anywhere
  // else would create planning structure or implementation detail nobody asked for.
  if (!isImmediateParentOfPrimaryWork(item, options.typeMap)) {
    return target;
  }
  return {
    ...target,
    commands: [
      ...(target.commands ?? []),
      buildNewChildCommand("New work identified", {
        parent: item,
        types: options.typeMap,
        adding: options.newChild.isOpen(item),
        onAdd: () => options.newChild.open(item),
      }),
    ],
  };
}

/**
 * Describes one rolled-up child for the badge's popup: its completion, its assignee chip, its
 * type-colored title, its own editable ETA badge, and the ADO deep link. The assignee and ETA
 * controls are built with the SAME helpers the tree rows use, so a rolled-up child is reassigned and
 * re-dated exactly like a row rather than being a read-only echo.
 */
function describeMinorChild(
  entry: RolledUpDescendant,
  options: TreeRenderOptions,
  treeDepth: number,
): ChildItemDescriptor {
  const { doc, typeMap, queue, context, boardColumns } = options;
  const { item: child, parent, siblingIds, depth } = entry;
  const url = itemUrl(doc, child.id);
  const eta = createItemEtaBadge(doc, child, typeMap, boardColumns, queue, context.services.now());
  return {
    depth,
    // Tagged like a tree row: a rolled-up child is the ONLY place its assignee appears, so hiding
    // the crew pill here hid which crew owns that work entirely — and left the popup the one place
    // a person could not be retagged.
    assignee: createItemAssignee(child, options.chip, true),
    done: isCompleted(child, typeMap, boardColumns),
    onToggleDone: (next) =>
      toggleMinorChildDone(child, options, next).then((completed) => {
        eta.setCompletedAt(completed ? child.stateChangeDate || null : undefined);
        return completed;
      }),
    title: child.title,
    titleColor: typeColorOf(child.type, typeMap),
    eta,
    url,
    // A rolled-up child is a work item like any other, so it answers the right-click with the same
    // menu a tree row does — otherwise the deepest level of the board would be the one place those
    // commands were unavailable.
    onContextMenu: (event) => options.contextMenu.openAt(event, itemMenuTarget(child, options)),
    onRowReady:
      options.dragReorder === null
        ? undefined
        : (row, title, dragContext) =>
            options.dragReorder?.register({
              id: child.id,
              depth: treeDepth,
              hasChildren: child.children.length > 0,
              parentId: parent.id,
              destinationType: options.typeMap.get(parent.type)?.children?.[0] ?? null,
              siblingIds,
              handle: title,
              row,
              wrapper: row,
              dragSurface: dragContext.surface,
              onLeaveSurface: dragContext.close,
            }),
  };
}

/**
 * Rolls a row's children up into a single "completed / total" badge, or null when there is nothing
 * to summarize.
 *
 * Deliberately NOT narrowed by the active filters: this is the row's COMPLETE child rollup. Counting
 * only the children that survive the filters made the denominator lie about the work — under the
 * resolved-age window a row whose children all finished last week reported no children at all
 * instead of "5 / 5", and under a sprint filter a child parked on another sprint silently left the
 * total. The rollup answers "how much of this is done?", which is a fact about the item rather than
 * about what the board is currently narrowed to.
 */
function createMinorChildrenBadge(
  item: TrackedWorkItem,
  options: TreeRenderOptions,
  childDepth: number,
): HTMLElement | null {
  const children = collectRolledUpDescendants(
    item,
    (child, depth) => !rendersAsTreeRow(child, options, childDepth + depth),
    options.orderingPolicy,
  );
  if (children.length === 0) return null;

  const descriptors = children.map((child) =>
    describeMinorChild(child, options, childDepth + child.depth),
  );

  const badge = renderChildItemsBadge(options.doc, {
    children: descriptors,
    initiallyOpen: options.reopenMinorChildPopup(item.id),
    // Counted off the very same per-child answer the rows tick their checkboxes from, so the badge
    // can never report a total the list it opens disagrees with.
    completedCount: descriptors.filter((descriptor) => descriptor.done).length,
    color: options.minorChildColor,
  });
  badge.classList.add("awesomeado-tracking__minor-children");
  badge.style.verticalAlign = "middle";
  badge.style.marginLeft = "6px";
  return badge;
}

/**
 * Creates the inline assignee control for a row, styled for this board's dense layout.
 */
function createRowAssignee(item: TrackedWorkItem, options: TreeRenderOptions): HTMLElement {
  const assignedEl = createItemAssignee(item, options.chip, true);
  // Flows inline right behind the title; middle-aligned to the text line. It is held off the title
  // because it is a separate fact about the item, not another control attached to the title, so
  // butted up close it read as part of the title itself.
  assignedEl.style.verticalAlign = "middle";
  assignedEl.style.whiteSpace = "nowrap";
  assignedEl.style.marginLeft = "8px";
  // Project-Tracking-only tweak: dim the assignee name a touch so it recedes behind the title on
  // this dense board. Applied here (not in the shared control) so other views keep the brighter
  // default; opacity keeps it theme-agnostic across light/dark/Follow-ADO.
  const assignedName = assignedEl.querySelector<HTMLElement>(".awesomeado-assigned__name");
  if (assignedName) {
    assignedName.style.opacity = "0.75";
  }
  return assignedEl;
}

const ROW_BLOCKED_MARKERS = [
  "blocked",
  "blockedByOtherTeam",
  "interrupt",
] as const satisfies readonly WorkItemMarker[];

/** Creates the blocked-condition pills carried directly by one work-item row. */
function createRowBlockedMarkerPills(
  item: TrackedWorkItem,
  options: TreeRenderOptions,
): HTMLElement[] {
  const services = options.context.services;
  const markerTags = services.markerTags();
  return ROW_BLOCKED_MARKERS.filter((marker) => itemHasMarker(item, marker, markerTags)).map(
    (marker) =>
      renderMarkerReasonsPill({
        doc: options.doc,
        item,
        marker,
        tags: markerTags[marker],
        accepted: marker === "interrupt" && options.interruptAcceptedIds.has(item.id),
        notesSinceIso: options.notesSinceIso,
        services,
      }),
  );
}

// A low-alpha neutral wash changes direction with the surface beneath it, so an option remains
// distinct on both light and dark themes without replacing its sprint-relation text color.
const SPRINT_OPTION_HIGHLIGHT = "var(--control-background-hover)";

/** Keeps pointer and keyboard navigation equally visible in the sprint popup. */
function setSprintOptionHighlighted(choice: HTMLButtonElement, highlighted: boolean): void {
  if (highlighted) {
    choice.style.backgroundColor = SPRINT_OPTION_HIGHLIGHT;
  } else {
    choice.style.removeProperty("background-color");
  }
}

/** Builds the direct sprint choices shown when the row's current-sprint chip is clicked. */
function buildSprintPillPopup(
  item: TrackedWorkItem,
  options: TreeRenderOptions,
  close: () => void,
): HTMLElement {
  const popup = options.doc.createElement("div");
  popup.className = "awesomeado-tracking__sprint-popup";
  popup.setAttribute("role", "menu");
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "padding:4px",
    "display:flex",
    "flex-direction:column",
    "align-items:stretch",
    "background:var(--callout-background-color)",
    "border:1px solid var(--control-border-strong)",
    "border-radius:6px",
    "box-shadow:0 2px 8px var(--shadow-subtle)",
    "z-index:1000",
  ].join(";");

  const commands = buildSprintMoveCommands({
    doc: options.doc,
    item,
    services: options.context.services,
    queue: options.queue,
    onChanged: options.repaint,
    sprintWindow: options.sprintWindow,
  });
  for (const command of commands) {
    const choice = options.doc.createElement("button");
    choice.type = "button";
    choice.className = "awesomeado-tracking__sprint-option";
    choice.setAttribute("role", "menuitem");
    choice.textContent = command.label;
    choice.style.cssText = [
      "display:block",
      "width:100%",
      "padding:4px 8px",
      "border:0",
      "border-radius:3px",
      "background:none",
      "color:var(--text-primary-color)",
      "font:inherit",
      "text-align:left",
      "white-space:nowrap",
      "cursor:pointer",
    ].join(";");
    for (const [property, value] of command.declarations ?? []) {
      choice.style.setProperty(property, value);
    }
    choice.addEventListener("mouseenter", () => setSprintOptionHighlighted(choice, true));
    choice.addEventListener("mouseleave", () => setSprintOptionHighlighted(choice, false));
    choice.addEventListener("focus", () => setSprintOptionHighlighted(choice, true));
    choice.addEventListener("blur", () => setSprintOptionHighlighted(choice, false));
    choice.addEventListener("click", () => {
      command.run?.();
      close();
    });
    popup.append(choice);
  }
  return popup;
}

/** Renders a clickable current-sprint chip whose menu offers every valid alternative. */
function createRowSprintPill(item: TrackedWorkItem, options: TreeRenderOptions): HTMLElement {
  const root = options.doc.createElement("span");
  root.className = "awesomeado-tracking__sprint-pill";
  root.style.cssText =
    "position:relative;display:inline-flex;margin-left:6px;vertical-align:middle";

  const pill = options.doc.createElement("button");
  pill.type = "button";
  pill.className = "awesomeado-tracking__sprint-pill-button";
  pill.setAttribute("aria-haspopup", "menu");
  pill.setAttribute("aria-label", `Move from ${item.sprintName ?? "current sprint"}`);
  pill.title = "Move to another sprint";
  pill.textContent = item.sprintName;
  // Deliberately the same neutral chip as the unassigned assignee control beside it. The popup's
  // option colors carry time direction; the current value stays quiet behind the item title.
  pill.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "vertical-align:middle",
    "background:var(--control-background-subtle)",
    "border:0",
    "border-radius:9px",
    "padding:1px 8px",
    "font-family:inherit",
    "font-size:9px",
    "font-weight:600",
    "line-height:1.6",
    "color:var(--text-secondary-color)",
    "white-space:nowrap",
    "cursor:pointer",
    "opacity:0.75",
  ].join(";");
  root.append(pill);

  createPopupHost({
    doc: options.doc,
    trigger: pill,
    mountInto: root,
    buildPopup: (close) => buildSprintPillPopup(item, options, close),
    interactive:
      buildSprintMoveCommands({
        doc: options.doc,
        item,
        services: options.context.services,
        queue: options.queue,
        onChanged: options.repaint,
        sprintWindow: options.sprintWindow,
      }).length > 0,
  });
  return root;
}

/**
 * Creates the row right-side controls. The assignee, blocked markers, sprint pill and rolled-up
 * child badge flow inline right after the title (returned in `inline`); the ETA is pinned to the
 * row's far right (returned separately).
 */
function createRowRightControls(
  item: TrackedWorkItem,
  options: TreeRenderOptions,
  childDepth: number,
): { inline: HTMLElement[]; eta: HTMLElement | null } {
  const { doc, context, typeMap, boardColumns, queue, showSprintPills } = options;
  const inline: HTMLElement[] = [];

  inline.push(createRowAssignee(item, options));
  inline.push(...createRowBlockedMarkerPills(item, options));

  if (showSprintPills && isLeafSprint(item)) {
    inline.push(createRowSprintPill(item, options));
  }

  // A type can allow sibling child types with different classifications, so a row may carry both
  // an expandable primary-work branch and an implementation-detail rollup.
  const minorChildren = createMinorChildrenBadge(item, options, childDepth);
  if (minorChildren) {
    inline.push(minorChildren);
  }

  const etaBadge = createItemEtaBadge(
    doc,
    item,
    typeMap,
    boardColumns,
    queue,
    context.services.now(),
  );
  // Pinned to the far right of the row, kept on one line. A FIXED font-size keeps every ETA the
  // same size across the whole tree: the nested rows shrink 10% per depth (childrenContainer's
  // font-size:90% compounds), which would otherwise render deeper ETAs progressively smaller.
  // It still top-aligns and shares the content block's 1.8em line-height, so it sits at the
  // vertical center of the row's FIRST line even when the title wraps to more lines below.
  etaBadge.style.flex = "0 0 auto";
  etaBadge.style.whiteSpace = "nowrap";
  etaBadge.style.fontSize = "11px";
  etaBadge.style.lineHeight = "1.8";
  etaBadge.style.alignSelf = "flex-start";

  return { inline, eta: etaBadge };
}

/**
 * Renders a single work item row with all its controls (twisty, state, title, assignee, blocked
 * markers, sprint pill, rolled-up child badge, ETA). Returns the row element, the children
 * container, and the twisty button (null when the row has no expandable child rows).
 */
function renderRow(
  item: TrackedWorkItem,
  options: TreeRenderOptions,
  depth: number,
): {
  row: HTMLElement;
  childrenContainer: HTMLElement;
  twisty: HTMLButtonElement | null;
  /** The row's own line box, whose midpoint tells a drag whether a drop lands above or below it. */
  line: HTMLElement;
  /** Everything belonging to this item bar its children, so no band between rows accepts nothing. */
  surface: HTMLElement;
  /** The title, which doubles as the drag handle when reordering is available. */
  title: HTMLElement;
} {
  const { doc, typeMap } = options;
  const childDepth = depth + 1;
  const showsChildRows = item.children.some((child) =>
    rendersAsTreeRow(child, options, childDepth),
  );

  const row = doc.createElement("div");
  row.className = "awesomeado-tracking__row";
  // The row never wraps: the ETA stays pinned to the far right (via its own auto margin) so it always
  // reads at the vertical center of the row's FIRST line. align-items:flex-start top-aligns the
  // fixed gutter, the content block (which wraps the title internally) and the ETA, and because those
  // three share the same first-line box height their vertical centers coincide with the first line.
  row.style.cssText = ["display:flex", "align-items:flex-start", "gap:8px", "padding:2px 0"].join(
    ";",
  );
  // Wired on the row itself (not the wrapper) so a right-click lands on the item whose LINE is under
  // the pointer: the wrapper also spans this row's description, notes and whole child subtree, which
  // belong to other items.
  row.addEventListener("contextmenu", (event) =>
    options.contextMenu.openAt(event, itemMenuTarget(item, options)),
  );

  const { gutter, stateBadge, priorityBadge, twisty } = createRowControls(
    item,
    options,
    showsChildRows,
  );
  row.append(gutter);

  const { titleSpan, descButton, descPanel, descriptionExpansion } = createTitleControls(
    doc,
    item,
    typeMap,
    options.mentionNames,
  );
  const notes = createItemNotes(item, options);
  options.descriptionExpansions.push(descriptionExpansion);
  options.noteExpansions.push(notes.expansion);
  const { inline, eta } = createRowRightControls(item, options, childDepth);

  // Status and priority badges, ? disc, type icon, title and assignee share ONE inline-flow block so
  // they read as a single line. Because they flow as inline content (not rigid flex items) they pack tightly and
  // wrap together, so the assignee always hugs the end of the wrapped title instead of drifting to a
  // stretched box's right edge. The block grows and shrinks (flex:1 1 auto) and wraps the title
  // INTERNALLY; the row itself never wraps, so the ETA stays to the right. The status badge is the
  // first inline child (vertical-align:middle) so it sits at the center of the first line. A <span>
  // (not a <div>) keeps it out of the row's div-ancestor chain; as a flex item it is still
  // blockified, so its inline children wrap within it.
  const contentBlock = doc.createElement("span");
  contentBlock.className = "awesomeado-tracking__content";
  contentBlock.style.cssText = "flex:1 1 auto;min-width:0;line-height:1.8";
  contentBlock.append(stateBadge, priorityBadge, descButton, notes.toggle, titleSpan, ...inline);
  row.append(contentBlock);

  if (eta) {
    // Auto margin pushes the ETA to the far right of the row; it top-aligns and shares the content's
    // 1.8em line-height, so it stays centered on the first line regardless of how many lines the
    // title wraps to below.
    eta.style.marginLeft = "auto";
    row.append(eta);
  }

  const childrenContainer = doc.createElement("div");
  childrenContainer.className = CHILDREN_CLASS;
  // Each depth reads 10% smaller than its parent (90% compounds down the tree). The vertical guide
  // line is drawn ONLY under the top-level parents (depth 0); margin-left ~= half the twisty width so
  // the line sits centered under the parent's expand/collapse triangle.
  const childrenStyles = ["padding-left:2px", "margin-left:10px", "font-size:90%"];
  if (depth === 0) {
    childrenStyles.push("border-left:1px solid var(--control-border-emphasis)");
  }
  childrenContainer.style.cssText = childrenStyles.join(";");
  // First inside the branch, so the title being typed sits at the top of the list it joins.
  const newChild = options.newChild.row(item);
  if (newChild !== null) {
    childrenContainer.append(newChild);
  }

  const rowWrapper = doc.createElement("div");
  rowWrapper.className = ITEM_WRAPPER_CLASS;
  const itemSurface = doc.createElement("div");
  itemSurface.className = ITEM_SURFACE_CLASS;
  itemSurface.append(row, descPanel, notes.panel);
  rowWrapper.append(itemSurface, childrenContainer);

  if (twisty) {
    wireTwisty(twisty, childrenContainer, item.id, options.collapsedIds, options.restripeRows);
  }

  return {
    row: rowWrapper,
    childrenContainer,
    twisty,
    line: row,
    surface: itemSurface,
    title: titleSpan,
  };
}

/**
 * Restores a row to the state the reader left it in, and remembers every toggle from then on.
 *
 * The restore happens on EVERY pass, not just the first: a repaint discards the elements the reader
 * was looking at, so a branch they closed would otherwise reopen behind their back.
 */
function wireTwisty(
  twisty: HTMLButtonElement,
  childrenContainer: HTMLElement,
  id: number,
  collapsedIds: Set<number>,
  restripeRows: () => void,
): void {
  setTwistyExpanded(twisty, childrenContainer, !collapsedIds.has(id));
  twisty.addEventListener("click", () => {
    const expanded = twisty.getAttribute("aria-expanded") !== "true";
    rememberExpanded(collapsedIds, id, expanded);
    setTwistyExpanded(twisty, childrenContainer, expanded);
    restripeRows();
  });
}

/** Records one row's expanded/collapsed state so the next render pass can reproduce it. */
function rememberExpanded(collapsedIds: Set<number>, id: number, expanded: boolean): void {
  if (expanded) {
    collapsedIds.delete(id);
  } else {
    collapsedIds.add(id);
  }
}

/**
 * Recursively renders `parent`'s children: each level is narrowed by the active filters, then
 * ordered by the binding's ordering policy. Returns an array of row wrappers (each contains row +
 * description + children container).
 *
 * The PARENT is passed rather than a bare list because a drag needs both halves of the level's
 * identity: which item a dropped row becomes a child of, and the level's FULL sibling order —
 * including the rows the active filters hide, so a filtered board still ranks a move where the user
 * aimed rather than relative to whatever happened to be on screen.
 *
 * Primary work and the planning context above it render as rows. Implementation details below the
 * deepest primary-work type are summarized by `createMinorChildrenBadge` instead.
 */
function rendersAsTreeRow(
  item: TrackedWorkItem,
  options: TreeRenderOptions,
  depth: number,
): boolean {
  return options.treeRowTypes.size === 0
    ? depth <= MAX_ROW_DEPTH
    : options.treeRowTypes.has(item.type);
}

function renderTree(
  parent: TrackedWorkItem,
  options: TreeRenderOptions,
  depth: number,
): HTMLElement[] {
  const ordered = orderTrackedItems(parent.children, (child) => child, options.orderingPolicy);
  const siblingIds = ordered.map((item) => item.id);
  const visible = ordered.filter(
    (item) => rendersAsTreeRow(item, options, depth) && options.visibleItemIds.has(item.id),
  );
  return visible.map((item) => {
    const { row, childrenContainer, twisty, line, surface, title } = renderRow(
      item,
      options,
      depth,
    );
    if (twisty) options.expandableRows.push({ id: item.id, twisty });

    options.dragReorder?.register({
      id: item.id,
      depth,
      hasChildren: item.children.length > 0,
      parentId: parent.id,
      destinationType: options.typeMap.get(parent.type)?.children?.[0] ?? null,
      siblingIds,
      handle: title,
      row: line,
      wrapper: row,
      // The surface carries the row's trailing padding and its description/notes panels, so the band
      // between two rows belongs to the one above it instead of swallowing the drop.
      dropZone: surface,
    });

    if (item.children.some((child) => rendersAsTreeRow(child, options, depth + 1))) {
      childrenContainer.append(...renderTree(item, options, depth + 1));
    }

    return row;
  });
}

/**
 * The board state that belongs to the READER rather than to the data, so a refresh must not throw
 * it away.
 *
 * Every one of these is the answer to "what was I looking at?": the outline someone collapsed down
 * to, the discussions they opened, the people and sprint they narrowed to, the order they chose.
 * Re-reading the tree replaces the whole board, and without somewhere outside it to keep these,
 * pressing Refresh would silently undo all of that — which is exactly why refreshing today means
 * reloading the page. It is deliberately session-scoped (never persisted), for the same reason the
 * ordering pick is not written back to the binding: it is a transient reading position, not a
 * setting.
 */
interface BoardSession {
  /** Nodes the reader collapsed; everything absent renders expanded. */
  collapsedIds: Set<number>;
  /** Rows whose notes panel the reader opened; everything absent renders closed. */
  expandedNoteIds: Set<number>;
  /** One state object per item, shared by every replacement panel rendered for that item. */
  notePanelStates: Map<number, NotesPanelState>;
  /** Discussion-date index retained across refreshes and revalidated by comment count. */
  recentNotes: RecentNotesIndex;
  /** The active tag filter (OR across the entries; empty = everyone). `null` is the untagged bucket. */
  selectedTags: Set<string | null>;
  /** Full area paths selected in the header (OR across entries; empty = every area). */
  selectedAreaPaths: Set<string>;
  /** The recent-activity pills the reader lit (OR across them; empty = no activity filter). */
  selectedActivity: Set<RecentActivityKind>;
  /** The marker pills the reader lit (OR across them; empty = no marker filter). */
  selectedMarkers: Set<WorkItemMarker>;
  /** Whether the last painted tree was empty, or null before the first one. Dedupes the log line. */
  boardWasEmpty: boolean | null;
  /** The sprint filter as the reader last left it, or null while they have not touched the picker. */
  sprint: { selectedName: string | null; filterActive: boolean } | null;
  /** The order the reader picked this session, or null while the binding's configured order applies. */
  orderingPolicy: OrderingPolicy | null;
  /** One-shot parent id whose rolled-up child popup reopens after a successful reorder repaint. */
  reopenMinorChildPopupId: number | null;
  /**
   * The item whose "add a child" box is open, or null when none is. One at a time by design: two
   * open boxes on one board make it ambiguous which list a typed title is being added to.
   */
  addingChildOf: number | null;
  /**
   * Items added from this board, kept visible whatever the filters say.
   *
   * The board only shows planning context that LEADS to primary work, so a milestone created a
   * moment ago — which by definition holds nothing yet — would vanish the instant it was created and
   * read as a failed command. What the reader just asked for is not something the filters get to
   * hide from them.
   */
  addedIds: Set<number>;
  /** Acceptance evidence is reloaded with the tree and updated by Sprint-only commands elsewhere. */
  interruptAcceptance: InterruptAcceptanceState;
}

/** A fresh session: nothing collapsed, nothing filtered, no pick that overrides the binding. */
function createBoardSession(services: EnhancedViewServices): BoardSession {
  return {
    collapsedIds: new Set<number>(),
    expandedNoteIds: new Set<number>(),
    notePanelStates: new Map<number, NotesPanelState>(),
    recentNotes: new RecentNotesIndex(
      services.noteActivity,
      services.logger,
      markerCommentPrefixes(services.markerTags()),
    ),
    selectedTags: new Set<string | null>(),
    selectedAreaPaths: new Set<string>(),
    selectedActivity: new Set<RecentActivityKind>(),
    selectedMarkers: new Set<WorkItemMarker>(),
    boardWasEmpty: null,
    sprint: null,
    orderingPolicy: null,
    reopenMinorChildPopupId: null,
    addingChildOf: null,
    addedIds: new Set<number>(),
    interruptAcceptance: { acceptedIds: new Set<number>(), failedIds: new Set<number>() },
  };
}

/**
 * Renders the sprint picker control using the reusable SprintPicker component, fed the shared sprint
 * window (the iterations around the current one, each already labelled by its offset). The filter
 * defaults ON and pre-selects the current sprint, so the board opens focused on the current sprint.
 *
 * A reader who has already chosen keeps that choice across a refresh; an UNTOUCHED picker re-seeds
 * from the freshly loaded window instead, so a board left open across a sprint boundary follows the
 * new current sprint rather than pinning itself to the one it opened on.
 */
function renderSprintControls(
  doc: Document,
  sprintWindow: SprintWindow,
  session: BoardSession,
): SprintPickerHandle {
  const chosen = session.sprint;
  return renderSprintPicker(doc, {
    sprints: sprintWindow.entries,
    selectedName: chosen?.selectedName ?? sprintWindow.currentName,
    filterActive: chosen?.filterActive ?? sprintWindow.entries.length > 0,
  });
}

/** Collect paths that can survive the board's non-optional resolved-age rule. */
function collectAreaPaths(
  items: readonly TrackedWorkItem[],
  isResolvedPastWindow: (item: TrackedWorkItem) => boolean,
): string[] {
  const paths = new Set<string>();
  for (const item of items) {
    if (
      !isResolvedPastWindow(item) &&
      typeof item.areaPath === "string" &&
      item.areaPath.length > 0
    ) {
      paths.add(item.areaPath);
    }
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
}

/**
 * The board's resolved-age rule, rebuilt per call rather than cached: "now" moves, so a board left
 * open long enough ages an item out the next time anything asks.
 */
function boardResolvedWindowFilter(
  context: DataDrivenViewContext,
  typeMap: Map<string, TypeCatalogEntry>,
  boardColumns: string[],
): (item: TrackedWorkItem) => boolean {
  return createResolvedWindowFilter(
    typeMap,
    boardColumns,
    hideResolvedAfterDays(context.properties),
    context.services.now(),
  );
}

/** The paths the header's Lanes filter offers: only the Primary work the filters actually judge. */
function collectBoardAreaPaths(
  root: TrackedWorkItem,
  context: DataDrivenViewContext,
  typeMap: Map<string, TypeCatalogEntry>,
  boardColumns: string[],
): string[] {
  return collectAreaPaths(
    workItemsEligibleForPrimaryFilter([root], [...typeMap.values()]),
    boardResolvedWindowFilter(context, typeMap, boardColumns),
  );
}

/**
 * The paths an item's edit menu offers. Wider than the header's on purpose: an implementation detail
 * can be moved to an area no Primary work sits in yet, and the root's own path is not a destination.
 */
function collectItemAreaPaths(
  root: TrackedWorkItem,
  context: DataDrivenViewContext,
  typeMap: Map<string, TypeCatalogEntry>,
  boardColumns: string[],
): string[] {
  return collectAreaPaths(
    flattenWorkItems(root.children),
    boardResolvedWindowFilter(context, typeMap, boardColumns),
  );
}

/** Build the shared full-path selector and keep stale refresh selections from hiding every row. */
function renderAreaPathControls(
  context: DataDrivenViewContext,
  areaPaths: readonly string[],
  session: BoardSession,
  onChange: () => void,
): AreaPathFilterHandle {
  for (const selected of [...session.selectedAreaPaths]) {
    if (!areaPaths.includes(selected)) session.selectedAreaPaths.delete(selected);
  }
  return renderAreaPathFilter(context.doc, {
    areaPaths,
    selectedAreaPaths: [...session.selectedAreaPaths],
    onChange: (selected) => {
      session.selectedAreaPaths.clear();
      for (const path of selected) session.selectedAreaPaths.add(path);
      context.services.logger.info(
        `Project Tracking area-path filter: selectedCount=${selected.length}.`,
      );
      onChange();
    },
  });
}

/**
 * Fills (or refills) the tech lead group with its label and the epic assignee's picker. Split out so
 * the group can be rebuilt in place from the header, which is not part of the tree re-render.
 */
function populateTechLead(
  group: HTMLElement,
  root: TrackedWorkItem,
  chipContext: AssigneeChipContext,
): void {
  const { doc } = chipContext;
  group.innerHTML = "";

  const label = doc.createElement("span");
  label.textContent = "TechLead:";
  label.style.cssText = "font-weight:500";
  group.append(label);

  // The Tech Lead is a single named owner, not a Feature Crew member, so its chip never shows a tag.
  const assignedEl = createItemAssignee(root, chipContext, false);
  // Nudge the chip 1px down so it reads as optically centered against the "TechLead:" label.
  assignedEl.style.position = "relative";
  assignedEl.style.top = "1px";
  group.append(assignedEl);
}

/**
 * Creates the tech lead group (label + assigned-to control).
 */
function createTechLeadGroup(
  root: TrackedWorkItem,
  chipContext: AssigneeChipContext,
): HTMLElement | null {
  const techLeadGroup = chipContext.doc.createElement("div");
  techLeadGroup.className = "awesomeado-tracking__techlead";
  techLeadGroup.style.cssText = ["display:flex", "align-items:center", "gap:8px"].join(";");

  populateTechLead(techLeadGroup, root, chipContext);

  return techLeadGroup;
}

/**
 * The controls the BOARD builds and the header only lays out. Bundled rather than passed one by one
 * so the header's signature does not grow an extra positional argument per indicator.
 */
interface HeaderBoardControls {
  /** The shared "Saving…" indicator, mounted on its own row above the sprint picker. */
  writeQueueStatus: HTMLElement;
  /** The discrete ordering indicator/picker, pinned to the tile's top-right corner. */
  orderingPicker: HTMLElement;
  /** Re-narrow the tree after the header's area-path selection changes. */
  onAreaPathChange: () => void;
  /**
   * The board's right-click menu for the ROOT item, opened from the project title — the one work
   * item the board never renders as a row, and which would otherwise be the only item on screen with
   * no way to copy its id, open it, or edit it.
   *
   * Handed in already wired rather than as the menu itself: the root's commands have to repaint both
   * the tree and this very header, neither of which exists yet when the header is built.
   */
  onTitleContextMenu: (event: MouseEvent) => void;
}

/**
 * Renders the header tile by delegating layout to the view's own header control, feeding it the
 * pieces the control does not build itself (the Tech Lead picker, the sprint picker, the ordering
 * picker, and the write-queue status indicator) plus the root's title, type color, and ETA.
 */
function renderHeader(
  doc: Document,
  root: TrackedWorkItem,
  context: DataDrivenViewContext,
  typeMap: Map<string, TypeCatalogEntry>,
  boardColumns: string[],
  sprintWindow: SprintWindow,
  areaPaths: readonly string[],
  session: BoardSession,
  chipContext: AssigneeChipContext,
  boardControls: HeaderBoardControls,
  folderPath: QueryFolderCrumb[],
  queue: WorkItemWriteQueue,
): {
  header: HTMLElement;
  /** Re-labels the project title after the root is renamed; the tree repaint cannot reach it. */
  setHeaderTitle: (title: string) => void;
  sprintPickerHandle: SprintPickerHandle;
  expandAll: HTMLButtonElement;
  collapseAll: HTMLButtonElement;
  refresh: RefreshButtonHandle;
  techLead: HTMLElement | null;
} {
  const sprintPickerHandle = renderSprintControls(doc, sprintWindow, session);
  const areaPathFilter = renderAreaPathControls(
    context,
    areaPaths,
    session,
    boardControls.onAreaPathChange,
  );
  const techLead = createTechLeadGroup(root, chipContext);

  // The view runs on the ADO query page, so the page's own URL supplies the org/project the folder
  // links resolve against; when it is not a recognizable ADO location the segment stays plain text
  // rather than pointing at a fabricated URL.
  const pageHref = doc.location?.href ?? "";

  const {
    element: header,
    setTitle: setHeaderTitle,
    expandAllButton: expandAll,
    collapseAllButton: collapseAll,
    refreshButton: refresh,
  } = renderProjectTrackingHeader(doc, {
    // The query's ancestor folders, read from ADO's query metadata (its `path`) alongside the tree.
    // Each folder links to its contents in ADO's query hub (`_queries/folder/…`).
    breadcrumbs: folderPath.map((folder) => {
      const url = buildQueryFolderUrl(pageHref, folder.path);
      return url === null ? { label: folder.label } : { label: folder.label, url };
    }),
    title: root.title,
    titleColor: typeColorOf(root.type, typeMap),
    onTitleContextMenu: boardControls.onTitleContextMenu,
    techLead,
    eta: createItemEtaBadge(doc, root, typeMap, boardColumns, queue, context.services.now()),
    areaPathFilter: areaPathFilter.element,
    sprintPicker: sprintPickerHandle.element,
    orderingPicker: boardControls.orderingPicker,
    writeQueueStatus: boardControls.writeQueueStatus,
    extensionVersion: context.extensionVersion,
  });

  return { header, setHeaderTitle, sprintPickerHandle, expandAll, collapseAll, refresh, techLead };
}

/**
 * Wires the expand/collapse-all button handlers.
 */
function wireExpandCollapseButtons(
  expandAll: HTMLButtonElement,
  collapseAll: HTMLButtonElement,
  rows: ExpandableRow[],
  collapsedIds: Set<number>,
  noteExpansions: ExpansionControl[],
  descriptionExpansions: ExpansionControl[],
  restripeRows: () => void,
): void {
  const setAllRowsExpanded = (expanded: boolean): void => {
    for (const { id, twisty } of rows) {
      // Recorded as well as applied: a repaint right after the click would otherwise undo it.
      rememberExpanded(collapsedIds, id, expanded);
      setTwistyExpanded(twisty, childrenContainerOf(twisty), expanded);
    }
    restripeRows();
  };

  expandAll.onclick = () => {
    if (rows.some(({ twisty }) => twisty.getAttribute("aria-expanded") !== "true")) {
      setAllRowsExpanded(true);
      return;
    }
    for (const expansion of noteExpansions) expansion.setExpanded(true);
  };

  collapseAll.onclick = () => {
    const details = [...noteExpansions, ...descriptionExpansions];
    if (details.some((expansion) => expansion.isExpanded())) {
      for (const expansion of details) expansion.setExpanded(false);
      return;
    }
    setAllRowsExpanded(false);
  };
}

/**
 * A rendered board plus the hooks the view uses to drive it after it is on screen.
 */
interface BoardHandle {
  element: HTMLElement;
  /**
   * Project the reconciled roster's tags onto the tree, then refresh the tag filter panel and tree so
   * every assignee pill shows its color and the panel offers the tags now in use. Safe to call more
   * than once (e.g. after a fresh person is picked and the roster grows).
   */
  applyCrewMembers(members: FeatureCrewMember[]): void;
  /**
   * Feed the count of in-flight user-triggered roster reconciles (tag picks / inline assignee
   * changes) so the shared "Saving…" indicator reflects those saves too, not just state writes.
   */
  setReconcilePending(count: number): void;
  /**
   * Rebuild the tree from the model that is already in hand, without refetching anything.
   *
   * Exposed because some of what a row shows arrives AFTER the board is on screen — today the
   * display names behind its `@`-mentions — and rows render synchronously, so a later answer only
   * reaches the reader on the next pass.
   */
  repaint(): void;
  /**
   * Resolves once this board's queued writes have settled.
   *
   * A re-read that overtakes an in-flight write is answered with the value the user just replaced,
   * and the board then paints their edit as if it had been lost — so a refresh waits on this first.
   */
  whenWritesSettled(): Promise<void>;
  /** Show the refresh button as busy (a re-read is running) or idle. */
  setRefreshBusy(busy: boolean): void;
  /** Show the refresh button as failed (this board is stale) or clear that state. */
  setRefreshFailed(failed: boolean): void;
}

/**
 * A "Saving…" indicator driven by BOTH in-flight field writes (status column, ETA) AND
 * user-triggered roster reconciles (tag picks / inline assignee changes). Each source reports its own
 * pending count; the displayed total is their sum, so the indicator shows for either kind of save.
 *
 * It also subscribes to the queue's FAILED count, because every editable control on this board is
 * persist-then-reflect: a rejected write leaves the screen unchanged, so without this the user
 * cannot tell a lost edit from a slow one. The failure chip only has room for a count, so activating
 * it opens the Diagnostics log on the errors, where the cause was recorded.
 *
 * No explicit unsubscribe is needed — the control and the queue share the board's lifetime (one
 * render per tab), so their lifetimes match.
 */
function createBoardWriteStatus(
  doc: Document,
  fieldWrites: WorkItemWriteQueue,
  onOpenLog: () => void,
): { element: HTMLElement; setReconcilePending: (count: number) => void } {
  const writeStatus = renderWriteQueueStatus(doc, { onOpenLog });
  let statePending = 0;
  let reconcilePending = 0;
  const refresh = (): void => writeStatus.setCount(statePending + reconcilePending);
  fieldWrites.onPendingChange((count) => {
    statePending = count;
    refresh();
  });
  fieldWrites.onWriteFailed((count, lastError) => {
    writeStatus.setFailedCount(count, lastError);
  });
  return {
    element: writeStatus.element,
    setReconcilePending: (count) => {
      reconcilePending = count;
      refresh();
    },
  };
}

/**
 * The tag-editing capability wired into every assignee pill: the tags currently worn across the
 * board (offered as quick-pick choices) plus the persist hook. Null when the project cannot store a
 * roster (no `onTagAssign`), so the pills stay read-only rather than pretending to save.
 */
function createTagEditor(
  root: TrackedWorkItem,
  onTagAssign: ((user: TrackedUser, tag: string) => void) | null,
): AssigneeTagEditor | null {
  return onTagAssign
    ? {
        tagsInUse: () => collectAssignedTags([root]).filter((tag): tag is string => tag !== null),
        assign: onTagAssign,
      }
    : null;
}

/**
 * Wire the sprint picker so toggling the funnel or changing the sprint re-renders the tree, and
 * record the reader's choice in the session so a refresh reopens on the same sprint. The click is
 * deferred a tick because the picker toggles its OWN internal state on the same click; both the
 * recording and the re-render must read the state after that flip, not before.
 */
function wireSprintPickerRerender(
  sprintPickerHandle: SprintPickerHandle,
  session: BoardSession,
  renderTreeContent: () => void,
): void {
  const pickerElement = sprintPickerHandle.element;
  const button = pickerElement.querySelector(
    ".awesomeado-sprint-picker__button",
  ) as HTMLButtonElement;
  const select = pickerElement.querySelector(
    ".awesomeado-sprint-picker__select",
  ) as HTMLSelectElement;

  const remember = (): void => {
    session.sprint = {
      selectedName: sprintPickerHandle.selectedSprint(),
      filterActive: sprintPickerHandle.isFilterActive(),
    };
  };

  if (button) {
    button.addEventListener("click", () => {
      setTimeout(() => {
        remember();
        renderTreeContent();
      }, 0);
    });
  }

  if (select) {
    select.addEventListener("change", () => {
      remember();
      renderTreeContent();
    });
  }
}

/** Everything the board's tree renderer needs to rebuild it from current state. */
interface BoardTreeRendererParams {
  doc: Document;
  root: TrackedWorkItem;
  context: DataDrivenViewContext;
  typeMap: Map<string, TypeCatalogEntry>;
  /**
   * The reader's own state (collapsed nodes, opened discussions, filter pills). Owned OUTSIDE the
   * renderer so it survives both a repaint and a refresh — see `BoardSession`.
   */
  session: BoardSession;
  treeContainer: HTMLElement;
  /**
   * Answers the "New notes" pill. Read at render time (never captured) because the answer arrives
   * asynchronously: the pass that lights the pill sees it pending, the pass after the discussions
   * land sees the result.
   */
  recentNotes: RecentNotesIndex;
  sprintPickerHandle: SprintPickerHandle;
  chipContext: AssigneeChipContext;
  /** The board's single right-click menu, handed to every pass rather than rebuilt per repaint. */
  contextMenu: ItemContextMenu;
  /** The team's sprint window, so an item's menu can offer the sprints it may move to. */
  sprintWindow: SprintWindow;
  /** The same full paths offered by the header's area-path filter. */
  areaPaths: readonly string[];
  fieldWrites: WorkItemWriteQueue;
  metrics: BoardMetrics;
  expandAll: HTMLButtonElement;
  collapseAll: HTMLButtonElement;
  /**
   * The ordering policy to sort by, read at render time rather than captured: the header's picker
   * changes it between passes, and a captured value would keep re-painting the original order.
   */
  currentOrderingPolicy: () => OrderingPolicy;
  /**
   * Registers each pass's rows for drag-to-reorder, or null when the board can never reorder (no
   * team is configured to rank against). Read at render time because availability also depends on
   * the live ordering policy.
   */
  dragReorder: DragReorderController | null;
  /**
   * Repaints the whole board — the filter row and then the tree — for a change that can alter which
   * pills exist. Taken as a callback rather than assembled here because the filter row's own renderer
   * is built ON this one, so the combined repaint only exists once both do.
   */
  repaintBoard: () => void;
}

function createTreeFilter(params: BoardTreeRendererParams, sprint: string | null): TreeFilter {
  const { properties } = params.context;
  return {
    sprint,
    areaPaths: params.session.selectedAreaPaths,
    tags: params.session.selectedTags,
    isResolvedPastWindow: createResolvedWindowFilter(
      params.typeMap,
      params.metrics.boardColumns,
      hideResolvedAfterDays(properties),
      params.context.services.now(),
    ),
    matchesRecentActivity: createRecentActivityFilter(
      properties,
      params.context.services.now(),
      params.session.selectedActivity,
      params.recentNotes,
    ),
    matchesMarkers: createMarkerFilter(
      params.context.services.markerTags(),
      params.session.selectedMarkers,
    ),
  };
}

/**
 * Rebuilds the tree under the current sprint, tag and recent-activity filters. Returned as a single
 * command because that is all a caller ever wants from it: a repaint.
 */
/**
 * The ids one pass leaves on screen, each item judged by only the filters that can speak to it.
 *
 * A milestone holding no delivery is the case worth naming: it is tested against everything except
 * the sprint, because nobody schedules a milestone into one.
 */
function visibleIdsForPass(
  params: BoardTreeRendererParams,
  filter: TreeFilter,
): ReadonlySet<number> {
  return visibleWithAddedItems(
    workItemIdsVisibleUnderPrimaryFilter(
      [params.root],
      [...params.typeMap.values()],
      (item, subject) =>
        matchesTreeFilter(item, subject === "primary-work" ? filter : unscheduledFilter(filter)),
    ),
    params.root,
    params.session.addedIds,
  );
}

function createBoardTreeRenderer(params: BoardTreeRendererParams): () => void {
  const { doc, root, treeContainer, sprintPickerHandle, expandAll, collapseAll } = params;

  // Survives every repaint AND every refresh, which is the whole point: the elements a reader
  // collapsed are thrown away on each pass (a drag-reorder, a re-sort, a filter change, a re-read),
  // so the outline they were looking at only comes back if the state is remembered outside the DOM.
  // Same reason, opposite default, for the opened discussions: a notes panel fetches when it opens,
  // so the rows that were OPENED are what has to survive — recording the closed ones would make every
  // newly-rendered row start by loading a discussion nobody asked to see.
  const { collapsedIds, expandedNoteIds, notePanelStates } = params.session;

  // Built once, not per pass: the box it hands out is the one the reader is typing into, and a fresh
  // one on every repaint would take the caret (and the typed title) away mid-word.
  const newChild = createNewChildSurface({
    doc,
    root,
    context: params.context,
    typeMap: params.typeMap,
    session: params.session,
    queue: params.fieldWrites,
    repaint: () => params.repaintBoard(),
  });

  const renderTreeContent = (): void => {
    const filterOn = sprintPickerHandle.isFilterActive();
    const expandableRows: ExpandableRow[] = [];
    const noteExpansions: ExpansionControl[] = [];
    const descriptionExpansions: ExpansionControl[] = [];
    const orderingPolicy = params.currentOrderingPolicy();
    // Every element from the previous pass is about to be discarded, so the controller's row map is
    // cleared before the new rows register themselves against it.
    params.dragReorder?.reset();
    const filter = createTreeFilter(params, filterOn ? sprintPickerHandle.selectedSprint() : null);
    const options: TreeRenderOptions = {
      doc,
      context: params.context,
      typeMap: params.typeMap,
      queue: params.fieldWrites,
      statusWidthCh: params.metrics.statusWidthCh,
      boardColumns: params.metrics.boardColumns,
      visibleItemIds: visibleIdsForPass(params, filter),
      orderingPolicy,
      // Sprint pills only earn their space when the sprint filter is not already narrowing the board.
      showSprintPills: !filterOn,
      chip: params.chipContext,
      contextMenu: params.contextMenu,
      sprintWindow: params.sprintWindow,
      areaPaths: params.areaPaths,
      interruptAcceptedIds: params.session.interruptAcceptance.acceptedIds,
      // Self-referencing so a menu command repaints through the very renderer it was built inside;
      // the reference resolves at call time, long after this assignment completes. It goes through
      // the whole-board repaint rather than this pass alone, because a command can also change which
      // filter pills the board should be offering.
      repaint: () => params.repaintBoard(),
      expandableRows,
      noteExpansions,
      descriptionExpansions,
      collapsedIds,
      expandedNoteIds,
      notePanelStates,
      // Rebuilt per pass for the same reason the resolved-age filter is: "the last N weeks" moves
      // with the clock, so a board left open must not keep fetching against the window it opened on.
      notesSinceIso: boardNotesSince(params.context),
      mentionNames: params.context.services.mentionDirectory.knownNames(),
      minorChildColor: params.metrics.minorChildColor,
      treeRowTypes: params.metrics.treeRowTypes,
      newChild,
      reopenMinorChildPopup: (parentId) => {
        if (params.session.reopenMinorChildPopupId !== parentId) {
          return false;
        }
        params.session.reopenMinorChildPopupId = null;
        return true;
      },
      restripeRows: () => restripeVisibleRows(treeContainer, ROW_EMPHASIS_CLASSES),
      // Manual drag order only means anything while the board is showing the manual rank; under any
      // other policy a dropped row would be re-sorted straight back out of the slot it landed in.
      dragReorder: orderingPolicy === MANUAL_ORDERING_POLICY ? params.dragReorder : null,
    };

    treeContainer.innerHTML = "";
    // The epic is already summarized in the header (title + TechLead), so the tree lists its
    // children downward rather than repeating the epic as the top row.
    const rows = renderTree(root, options, 0);
    logBoardEmptinessFlip(params.context, params.session, rows.length, filter);
    fillTreeContainer(doc, treeContainer, rows, newChild.row(root));
    restripeVisibleRows(treeContainer, ROW_EMPHASIS_CLASSES);

    wireExpandCollapseButtons(
      expandAll,
      collapseAll,
      expandableRows,
      collapsedIds,
      noteExpansions,
      descriptionExpansions,
      options.restripeRows,
    );
  };

  return renderTreeContent;
}

/**
 * Fills the tree with one pass's rows, or with the panel that explains why there are none.
 *
 * The box asking for a new item's title goes above everything, the empty state included: it is the
 * answer to why the list is about to change, and a board the filters have emptied is exactly when
 * adding to it is useful.
 */
function fillTreeContainer(
  doc: Document,
  treeContainer: HTMLElement,
  rows: readonly HTMLElement[],
  newChildRow: HTMLElement | null,
): void {
  // The query itself is known to have returned items by this point, so an empty tree can only mean
  // the filters hid all of them — say so rather than leaving a blank panel that reads as a failure.
  const body =
    rows.length === 0
      ? [
          renderEmptyState(doc, {
            message: "No items match the current filters.",
            hint: "Clear or widen a filter above to bring items back.",
          }),
        ]
      : rows;
  treeContainer.append(...(newChildRow === null ? [] : [newChildRow]), ...body);
}

/**
 * Records the tree flipping between showing rows and hiding everything, with the selections that
 * decided it. "Why is my board empty?" has to be answerable from the log alone, and the filters are
 * the only thing that can answer it. Only the FLIP is recorded: every pill click repaints, and an
 * unchanged conclusion logged each time would push the errors that matter out of the ring buffer.
 */
function logBoardEmptinessFlip(
  context: DataDrivenViewContext,
  session: BoardSession,
  rowCount: number,
  filter: TreeFilter,
): void {
  const empty = rowCount === 0;
  if (session.boardWasEmpty === empty) return;
  session.boardWasEmpty = empty;
  context.services.logger.info(
    `Project Tracking tree ${empty ? "hid every row" : "is showing rows"}: rows=${rowCount}, ` +
      `sprint=${filter.sprint ?? "any"}, areaPaths=${filter.areaPaths.size}, ` +
      `tags=${filter.tags.size}, activity=[${[...session.selectedActivity].join(", ")}], ` +
      `markers=[${[...session.selectedMarkers].join(", ")}].`,
  );
}

/** The one word that introduces the filter row, sized and colored to sit quietly beside the pills. */
function renderFiltersLabel(doc: Document): HTMLElement {
  const label = doc.createElement("span");
  label.className = "awesomeado-tracking__filters-label";
  label.textContent = "Filters:";
  label.style.cssText = [
    "font-size:11px",
    "font-weight:600",
    "color:var(--text-secondary-color)",
    "margin-right:2px",
  ].join(";");
  return label;
}

/**
 * The board's filter row: the "Filters:" label, a tag/marker family, and an activity family.
 *
 * Rebuilt whole on every change so the families and tree cannot disagree. Each family wraps its own
 * pills, and the larger gap between families carries the distinction that opacity cannot communicate
 * without making an enabled filter look disabled.
 */
function createFilterRowRenderer(params: {
  doc: Document;
  root: TrackedWorkItem;
  context: DataDrivenViewContext;
  container: HTMLElement;
  session: BoardSession;
  recentNotes: RecentNotesIndex;
  /** Re-narrow the tree after any pill toggles. */
  onChange: () => void;
}): () => void {
  const { doc, root, context, container, recentNotes } = params;
  const { selectedTags, selectedActivity, selectedMarkers } = params.session;
  const windowHours = recentChangesWindowHours(context.properties);
  const filterItems = workItemsEligibleForPrimaryFilter([root], context.services.getTypes());

  // True while a repaint is already queued behind the index's in-flight read. Without it, every
  // render that happens while the discussions are being read would queue another repaint against the
  // same read, and they would all fire together when it lands.
  let repaintQueuedOnNotes = false;

  const render = (): void => {
    // Dropping a selected tag nobody in the tree wears any more is what keeps the filter from
    // getting stuck on a tag that has no pill left to unclick.
    const tags = assignedTagsOf(filterItems);
    for (const selected of [...selectedTags]) {
      if (!tags.includes(selected)) selectedTags.delete(selected);
    }

    // Same reason, for the markers: a pill only exists while something in the tree carries it, so a
    // selection left over from before an item was un-blocked has to go with the pill it belonged to.
    const markerTags = context.services.markerTags();
    const markers = collectMarkersInUse(filterItems, markerTags);
    for (const selected of [...selectedMarkers]) {
      if (!markers.includes(selected)) selectedMarkers.delete(selected);
    }

    const repaint = (): void => {
      render();
      params.onChange();
    };

    if (selectedActivity.has("notes")) {
      // Idempotent: the index only re-reads a discussion whose recorded answer is missing or has gone
      // stale, so calling this on every repaint costs nothing once the board has been covered.
      recentNotes.ensureProbed(filterItems);
      if (recentNotes.isPending() && !repaintQueuedOnNotes) {
        // The pills and the tree both answer "New notes" out of the index, so both are repainted
        // ONCE — when the read lands — rather than flickering as individual answers arrive.
        repaintQueuedOnNotes = true;
        void recentNotes.whenSettled().then(() => {
          repaintQueuedOnNotes = false;
          repaint();
        });
      }
    }

    const tagPills = renderTagFilterPills(doc, {
      tags,
      selected: selectedTags,
      onChange: repaint,
    });
    const activityPills = renderActivityFilterPills(doc, {
      selected: selectedActivity,
      windowHours,
      notesPending: recentNotes.isPending(),
      onChange: () => {
        logActivityFilterFlip(context, selectedActivity, windowHours);
        repaint();
      },
    });
    const markerPills = renderMarkerFilterPills(doc, {
      markers,
      markerTags,
      selected: selectedMarkers,
      onChange: () => {
        logMarkerFilterFlip(context, selectedMarkers);
        repaint();
      },
    });
    container.replaceChildren(
      renderFiltersLabel(doc),
      renderFilterPillFamilies(doc, [
        { name: "other", pills: [...tagPills, ...markerPills] },
        { name: "activity", pills: activityPills },
      ]),
    );
  };

  return render;
}

/**
 * Records a marker flip, for the same reason the recent-activity one is recorded: a rare,
 * user-driven change to what the WHOLE board shows, and the log is where "why is this item missing?"
 * has to be answerable from.
 */
function logMarkerFilterFlip(
  context: DataDrivenViewContext,
  selected: ReadonlySet<WorkItemMarker>,
): void {
  context.services.logger.info(
    `Project Tracking marker filter: selected=[${[...selected].join(", ")}].`,
  );
}

/**
 * Records a recent-activity flip: a rare, user-driven change to what the WHOLE board shows, the same
 * reason the ordering pick is logged. Both the resulting selection and the window are recorded, so
 * "why is this item missing?" is answerable from the log alone.
 */
function logActivityFilterFlip(
  context: DataDrivenViewContext,
  selected: ReadonlySet<RecentActivityKind>,
  windowHours: number,
): void {
  context.services.logger.info(
    `Project Tracking recent-activity filter: selected=[${[...selected].join(", ")}], ` +
      `windowHours=${windowHours}.`,
  );
}

/**
 * The board's ordering control: the header's picker element plus the live policy it drives.
 *
 * Seeded from the binding's stored setting and then owned by the SESSION, so a pick re-sorts the
 * items already on screen and survives a refresh. The pick is deliberately NOT written back to the
 * binding: persisting it would round-trip through synced storage and rebuild the whole board to
 * re-show items nobody re-fetched — the same reason the sprint and tag filters stay in-session. The
 * binding keeps deciding the order every board opens on.
 */
function createOrderingControl(
  context: DataDrivenViewContext,
  session: BoardSession,
  resort: () => void,
  dragReorderUnavailable: (policy: OrderingPolicy) => string | null,
): { element: HTMLElement; policy: () => OrderingPolicy } {
  let policy = session.orderingPolicy ?? orderingPolicyOf(context.properties);
  const element = renderOrderingPicker(context.doc, {
    policy,
    dragReorderUnavailable,
    onChange: (picked) => {
      // A rare, user-driven flip that changes what the whole board shows, so record the policies it
      // moved between — "why is this sorted like that?" is then answerable from the log alone.
      context.services.logger.info(
        `Project Tracking ordering changed for this session: from=${policy}, to=${picked}, ` +
          `bindingPolicy=${orderingPolicyOf(context.properties)}`,
      );
      policy = picked;
      session.orderingPolicy = picked;
      resort();
    },
  });
  return { element, policy: () => policy };
}

/**
 * Persists a drag-reorder and repaints the board once Azure DevOps has accepted it.
 *
 * Persist-then-reflect, exactly like every other editable control on this board: the tree is not
 * touched until ADO confirms, so a rejected move leaves the item visibly where it started rather
 * than in a place nobody saved. The board's shared "Saving…" indicator covers the gap (the move
 * rides the same queue as the field writes) and reports the loss, so there is nothing to roll back.
 *
 * The move goes through that shared queue for a second reason: a re-parent patches the item under a
 * `/rev` test, so running it beside an in-flight status or ETA write on the same item would race on
 * exactly the value the test guards.
 */
function persistMove(params: {
  root: TrackedWorkItem;
  move: PlannedMove;
  team: string;
  queue: WorkItemWriteQueue;
  services: EnhancedViewServices;
  session: BoardSession;
  repaint: () => void;
}): void {
  const { root, move, queue, services, session, repaint } = params;
  const moved = findTrackedItem(root, move.id);
  if (moved === null) {
    // The board is showing a tree that no longer contains the dragged item; writing a rev from a
    // stale model would be worse than declining the move.
    services.logger.error(`Drag-reorder aborted: item ${move.id} is not in the rendered tree.`);
    return;
  }
  const movedDepth = trackedItemDepth(root, move.id);
  const reopensMinorChildPopup = movedDepth !== null && movedDepth > MAX_ROW_DEPTH;
  void queue
    .enqueueReorder({
      id: move.id,
      currentRev: () => moved.rev,
      parentId: move.parentId,
      currentParentId: move.currentParentId,
      previousId: move.previousId,
      nextId: move.nextId,
      siblingIds: move.siblingIds,
      type: move.type,
      team: params.team,
    })
    .then((result) => {
      if (result.rev !== undefined) {
        moved.rev = result.rev;
      }
      if (result.ranks !== undefined) {
        // Placing one item can renumber its whole level, so every reported rank is copied back or
        // the next re-sort would order the level by numbers ADO no longer holds.
        applyRanksToTree(root, result.ranks);
      }
      // A move whose re-parent landed but whose ranking did not is still a change ADO has applied:
      // leaving the item under its old parent on screen would show a tree that no longer exists and
      // send the same rejected request again on the next drag.
      if (!result.ok && result.reparented !== true) {
        return;
      }
      if (move.type !== undefined) {
        moved.type = move.type;
      }
      if (applyMoveToTree(root, move, result.order ?? null)) {
        if (reopensMinorChildPopup) {
          session.reopenMinorChildPopupId = move.parentId;
        }
        repaint();
      }
    });
}

/** The item's rendered tree depth, where the root itself is -1; null when the item is absent. */
function trackedItemDepth(root: TrackedWorkItem, id: number, depth = -1): number | null {
  if (root.id === id) {
    return depth;
  }
  for (const child of root.children) {
    const found = trackedItemDepth(child, id, depth + 1);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/** The item with `id` at or below `root`, or null when this tree does not hold it. */
function findTrackedItem(root: TrackedWorkItem, id: number): TrackedWorkItem | null {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children) {
    const found = findTrackedItem(child, id);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/** The ids from `root` down to `id` inclusive, or null when this tree does not hold it. */
function pathToTrackedItem(
  root: TrackedWorkItem,
  id: number,
  trail: number[] = [],
): number[] | null {
  const path = [...trail, root.id];
  if (root.id === id) {
    return path;
  }
  for (const child of root.children) {
    const found = pathToTrackedItem(child, id, path);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/** Adds the items this reader created — and the branches leading to them — to what a pass shows. */
function visibleWithAddedItems(
  visible: ReadonlySet<number>,
  root: TrackedWorkItem,
  addedIds: ReadonlySet<number>,
): ReadonlySet<number> {
  if (addedIds.size === 0) {
    return visible;
  }
  const withAdded = new Set(visible);
  for (const id of addedIds) {
    for (const ancestor of pathToTrackedItem(root, id) ?? []) withAdded.add(ancestor);
  }
  return withAdded;
}

/**
 * The two containers the board repaints into, appended in reading order.
 *
 * The filter row is created up front rather than inserted once it has something to show: its tag
 * pills only appear when the Feature Crew roster resolves, and a row appearing between the header
 * and the tree would otherwise shove the whole board down mid-read.
 */
function createBoardPanels(
  doc: Document,
  board: HTMLElement,
): { filterRow: HTMLElement; treeContainer: HTMLElement } {
  const filterRow = doc.createElement("div");
  filterRow.className = "awesomeado-tracking__filters";
  // The row wraps the label and family container; each family handles the pills inside it.
  filterRow.style.cssText = [
    "display:flex",
    "flex-wrap:wrap",
    "align-items:center",
    "gap:6px",
    "margin:8px 0",
  ].join(";");
  const treeContainer = doc.createElement("div");
  treeContainer.className = "awesomeado-tracking__tree";
  board.append(filterRow, treeContainer);
  return { filterRow, treeContainer };
}

/**
 * How every assignee chip on this board offers people and persists a pick.
 *
 * `crew` walks the live tree on each popup open rather than caching a list, so a person assigned a
 * moment ago is already offered and there is no second copy of "who is on this project" to drift.
 */
function createChipContext(
  doc: Document,
  services: EnhancedViewServices,
  queue: WorkItemWriteQueue,
  root: TrackedWorkItem,
  onPicked: (user: DirectoryUser) => void,
  tagEditor: AssigneeTagEditor | null,
): AssigneeChipContext {
  return {
    doc,
    services,
    queue,
    crew: () => collectAssignedDirectoryUsers([root]),
    onPicked,
    tagEditor,
  };
}

/**
 * The board's drag-to-reorder half: the controller that turns rows into a drop surface, and the rule
 * that decides whether reordering is offered at all.
 *
 * Both are built together because they answer the same question from opposite ends — the rule tells
 * the user why a drag is unavailable, the controller is simply absent in exactly those cases — and a
 * board that explained one condition while enforcing another would be worse than silent.
 */
function createBoardReordering(params: {
  root: TrackedWorkItem;
  services: EnhancedViewServices;
  queue: WorkItemWriteQueue;
  doc: Document;
  session: BoardSession;
  repaint: () => void;
}): {
  controller: DragReorderController | null;
  dragReorderUnavailable: (policy: OrderingPolicy) => string | null;
} {
  const { root, services, queue, doc, session, repaint } = params;
  // Backlog rank is per-team in Azure DevOps, so without a configured team there is no backlog to
  // rank a dragged item against — the board says so on the ordering glyph instead of offering a
  // handle that would fail on every drop.
  const team = services.currentTeam();
  return {
    controller:
      team === null
        ? null
        : new DragReorderController(
            doc,
            (move) => persistMove({ root, move, team, queue, services, session, repaint }),
            services.logger,
          ),
    dragReorderUnavailable: (policy) => {
      if (team === null) {
        return "drag to reorder needs a team (set one in AwesomeADO options)";
      }
      return policy === MANUAL_ORDERING_POLICY
        ? null
        : "drag to reorder is only available when ordering by importance";
    },
  };
}

/**
 * Renders the complete board: header + tree, wired with expand/collapse and sprint-picker filter controls.
 */
/**
 * Everything a board assembles once and then shares between its header, its rows, and every repaint.
 *
 * Gathered into one factory because these collaborators are mutually dependent — the write queue
 * feeds the status indicator, the ordering glyph and the drag controller both need to trigger a
 * repaint, and the repaint only exists after the renderer is built. Wiring that knot inline left
 * `renderBoard` reading as a list of unrelated locals in which the one real ordering constraint (the
 * late-bound repaint) was invisible.
 */
interface BoardCore {
  services: EnhancedViewServices;
  /** The board's single serialized ADO write queue: field edits and moves never race on System.Rev. */
  writes: WorkItemWriteQueue;
  writeStatus: { element: HTMLElement; setReconcilePending: (count: number) => void };
  metrics: BoardMetrics;
  chipContext: AssigneeChipContext;
  ordering: { element: HTMLElement; policy: () => OrderingPolicy };
  dragReorder: DragReorderController | null;
  /**
   * Hand the core the tree renderer once it exists, so the ordering glyph and a completed drag can
   * repaint. Safe to call after construction only: neither a click nor a drop can arrive before the
   * board's synchronous setup finishes.
   */
  setRepaint(repaint: () => void): void;
}

/** Values derived once per board that every row on it shares. */
interface BoardMetrics {
  /** One shared badge width so every status badge on the board renders the same size. */
  statusWidthCh: number;
  /** The global board-column order, so a status colors by its position (identical across types). */
  boardColumns: string[];
  /** The tint the rolled-up child badge wears; null leaves it a neutral chip. */
  minorChildColor: string | null;
  /** Primary-work types and every planning-context type on a path above them. */
  treeRowTypes: ReadonlySet<string>;
}

function createBoardCore(params: {
  doc: Document;
  root: TrackedWorkItem;
  context: DataDrivenViewContext;
  typeMap: Map<string, TypeCatalogEntry>;
  session: BoardSession;
  onAssigneeChange: (user: DirectoryUser) => void;
  onTagAssign: ((user: TrackedUser, tag: string) => void) | null;
}): BoardCore {
  const { doc, root, context, typeMap } = params;
  const services = context.services;
  const writes = new WorkItemWriteQueue(services.writeField, services.logger, services.reorderItem);

  let repaint: () => void = () => {};
  const reordering = createBoardReordering({
    root,
    services,
    queue: writes,
    doc,
    session: params.session,
    repaint: () => repaint(),
  });

  return {
    services,
    writes,
    writeStatus: createBoardWriteStatus(doc, writes, () => services.openDiagnosticsLog()),
    metrics: {
      statusWidthCh: widestStatusLabelLength(root, typeMap),
      boardColumns: services.getBoardColumns(),
      // Rolled-up children always sit at the bottom of the configured hierarchy, so the rollup badge
      // wears a discrete tint of the LAST configured type's color — it reads as "these are the Tasks"
      // without having to name the type on a badge that only has room for a count.
      minorChildColor: lastTypeColor(services.getTypes()),
      treeRowTypes: primaryWorkWithAncestors(services.getTypes()),
    },
    chipContext: createChipContext(
      doc,
      services,
      writes,
      root,
      params.onAssigneeChange,
      createTagEditor(root, params.onTagAssign),
    ),
    ordering: createOrderingControl(
      context,
      params.session,
      () => repaint(),
      reordering.dragReorderUnavailable,
    ),
    dragReorder: reordering.controller,
    setRepaint: (next) => {
      repaint = next;
    },
  };
}

/** Everything one board render needs. A bag rather than a positional list: it is nine values deep. */
interface RenderBoardParams {
  doc: Document;
  root: TrackedWorkItem;
  /** Stable view root whose parent is the enhanced-view surface that must remain uncovered. */
  viewRoot: HTMLElement;
  context: DataDrivenViewContext;
  typeMap: Map<string, TypeCatalogEntry>;
  sprintWindow: SprintWindow;
  /** The reader's own state, owned by the view so it outlives this board (see `BoardSession`). */
  session: BoardSession;
  onAssigneeChange: (user: DirectoryUser) => void;
  onTagAssign: ((user: TrackedUser, tag: string) => void) | null;
  folderPath: QueryFolderCrumb[];
  /**
   * Asked to re-read the board from Azure DevOps. Owned by the VIEW, not the board: a refresh
   * replaces this board with the next one, so a board cannot be the thing that survives it.
   */
  onRefresh: () => void;
}

/**
 * Mounts everything below the header — the filter row and the tree — and hands back the two
 * renderers the board drives them with.
 *
 * Split out of `renderBoard` because these pieces only make sense together: the tree reads the
 * recent-notes index, the activity pills are what fill it, and the index repaints both once its
 * reads land. That circle is the reason for the late-bound settle hook, and it is far easier to see
 * on its own than buried among the header's wiring.
 */
function mountBoardBody(params: {
  doc: Document;
  root: TrackedWorkItem;
  context: DataDrivenViewContext;
  typeMap: Map<string, TypeCatalogEntry>;
  session: BoardSession;
  board: HTMLElement;
  sprintPickerHandle: SprintPickerHandle;
  chipContext: AssigneeChipContext;
  /** The board's single right-click menu, built once by `renderBoard` and shared with the header. */
  contextMenu: ItemContextMenu;
  /** The team's sprint window, forwarded to the tree so an item's menu can offer sprint moves. */
  sprintWindow: SprintWindow;
  /** Every eligible destination path offered by item edit menus. */
  areaPaths: readonly string[];
  core: BoardCore;
  expandAll: HTMLButtonElement;
  collapseAll: HTMLButtonElement;
}): { renderTreeContent: () => void; refreshFilters: () => void } {
  const { doc, root, context, session, core } = params;
  const { filterRow, treeContainer } = createBoardPanels(doc, params.board);

  // Asked through the bulk activity reader, not the per-item note loader: the pill needs one date per
  // item, and answering it through the loader cost a credentialed round-trip and up to 200 rendered
  // comments per row. The filter row owns repainting once a read lands (see `createFilterRowRenderer`).
  const recentNotes = session.recentNotes;

  // Late-bound because the two halves are built in a cycle: the tree renderer hands menu commands a
  // whole-board repaint, and the filter row is built ON the tree renderer. Reassigned below, once
  // both exist; until then a menu cannot have been opened, so the stub can never be the one that runs.
  let repaintBoard = (): void => {};

  const renderTreeContent = createBoardTreeRenderer({
    doc,
    root,
    context,
    typeMap: params.typeMap,
    session,
    treeContainer,
    recentNotes,
    sprintPickerHandle: params.sprintPickerHandle,
    chipContext: params.chipContext,
    contextMenu: params.contextMenu,
    sprintWindow: params.sprintWindow,
    areaPaths: params.areaPaths,
    fieldWrites: core.writes,
    metrics: core.metrics,
    expandAll: params.expandAll,
    collapseAll: params.collapseAll,
    currentOrderingPolicy: core.ordering.policy,
    dragReorder: core.dragReorder,
    repaintBoard: () => repaintBoard(),
  });

  const refreshFilters = createFilterRowRenderer({
    doc,
    root,
    context,
    container: filterRow,
    session,
    recentNotes,
    onChange: renderTreeContent,
  });
  // Filters FIRST: a command that flagged an item changes which pills exist, and the pass that drops
  // a now-impossible selection has to run before the tree narrows by it.
  repaintBoard = () => {
    refreshFilters();
    renderTreeContent();
  };
  // Painted before the first tree pass so the pills are on screen from the board's first frame; a
  // selection carried across a refresh also re-starts its discussion reads here.
  refreshFilters();

  return { renderTreeContent, refreshFilters };
}

/**
 * Renders the board's header tile, including the root item's own right-click menu.
 *
 * Split out of `renderBoard` because the header takes almost everything the board has, and its
 * argument list buried the handful of lines that actually assemble the board around it.
 *
 * `onRootChanged` is invoked (not captured) at command time: the surfaces a root edit has to repaint
 * — the tree, and this very header — are both built after the handler the header needs.
 */
function mountBoardHeader(params: {
  doc: Document;
  root: TrackedWorkItem;
  context: DataDrivenViewContext;
  typeMap: Map<string, TypeCatalogEntry>;
  sprintWindow: SprintWindow;
  itemAreaPaths: readonly string[];
  areaPaths: readonly string[];
  session: BoardSession;
  core: BoardCore;
  folderPath: QueryFolderCrumb[];
  contextMenu: ItemContextMenu;
  onRootChanged: () => void;
  onAreaPathChange: () => void;
}): ReturnType<typeof renderHeader> {
  const { doc, root, context, typeMap, sprintWindow, session, core } = params;
  return renderHeader(
    doc,
    root,
    context,
    typeMap,
    core.metrics.boardColumns,
    sprintWindow,
    params.areaPaths,
    session,
    core.chipContext,
    {
      writeQueueStatus: core.writeStatus.element,
      orderingPicker: core.ordering.element,
      onAreaPathChange: params.onAreaPathChange,
      onTitleContextMenu: (event) =>
        params.contextMenu.openAt(event, rootMenuTarget(params, root, context, sprintWindow)),
    },
    params.folderPath,
    core.writes,
  );
}

/**
 * The root's menu: everything an item's menu offers, plus the commands that govern the PROJECT.
 *
 * "Mark completed" belongs here rather than on any row because the root is the project this board
 * exists to report on — and the query being viewed is that project's tracking query, which is
 * exactly what completing it offers to clean up. "Create Project Query" is left out: the board is
 * already standing on one, so a second could only ever be a duplicate.
 *
 * "Add new milestone/phase" belongs here for the same reason in reverse: the root's own children are
 * the board's top level, and the title is the only place that level can be added to.
 */
function rootMenuTarget(
  params: Parameters<typeof mountBoardHeader>[0],
  root: TrackedWorkItem,
  context: DataDrivenViewContext,
  sprintWindow: SprintWindow,
): ItemContextMenuTarget {
  const target = menuTargetFor({
    doc: params.doc,
    item: root,
    context,
    queue: params.core.writes,
    sprintWindow,
    areaPaths: params.itemAreaPaths,
    onChanged: params.onRootChanged,
  });
  return {
    ...target,
    commands: [
      ...(target.commands ?? []),
      buildNewChildCommand("Add new milestone/phase", {
        parent: root,
        types: params.typeMap,
        adding: params.session.addingChildOf === root.id,
        onAdd: () => {
          params.session.addingChildOf = root.id;
          params.onRootChanged();
        },
      }),
      ...buildProjectLifecycleCommands({
        doc: params.doc,
        item: root,
        services: context.services,
        queue: params.core.writes,
        onChanged: params.onRootChanged,
        types: params.typeMap,
        // The board IS this project's tracking query, so the link is known without reading it; the
        // worker locates the hyperlink itself and simply skips it when the project carries none.
        // Deletable whoever saved it: the reader is standing on this query and bound this view to
        // it, so "delete the query" here names the one thing on screen.
        queryLink: {
          workItemId: root.id,
          queryId: context.queryId,
          url: params.doc.location?.href ?? "",
          managed: true,
        },
        queryLinkKnown: true,
        queryFolderPath: "",
        offerCreate: false,
        offerComplete: true,
        // Deliberately a repaint, not a re-read: completing may have just deleted the very query
        // this board loads from, and re-reading it would replace the result with a load failure.
        onReload: params.onRootChanged,
      }),
    ],
  };
}

/** Build the board-wide menu against the stable enhanced-view surface rather than the viewport. */
function createBoardContextMenu(params: RenderBoardParams, board: HTMLElement): ItemContextMenu {
  return createItemContextMenu({
    doc: params.doc,
    mountInto: board,
    panelBounds: () => params.viewRoot.parentElement ?? params.viewRoot,
    logger: params.context.services.logger,
  });
}

function renderBoard(params: RenderBoardParams): BoardHandle {
  const { doc, root, context, typeMap, sprintWindow, session, folderPath } = params;
  const board = doc.createElement("div");
  // Trim the top padding to 2px so the header card sits close to the top of the view; the sides and
  // bottom keep the board's shared edge padding.
  board.style.cssText = `padding:2px ${BOARD_EDGE_PADDING_PX}px ${BOARD_EDGE_PADDING_PX}px`;
  board.append(createRowEmphasisStyle(doc, ROW_EMPHASIS_CLASSES, ITEM_SURFACE_EXTRA_CSS));

  // One menu for the whole board: only one context menu can ever be open, and its pointer anchor has
  // to outlive the rows a repaint throws away — so it is mounted on the board rather than in the tree
  // container the renderer empties on every pass. Built before the header, because the project title
  // opens it for the root item.
  const contextMenu = createBoardContextMenu(params, board);

  const core = createBoardCore({
    doc,
    root,
    context,
    typeMap,
    session,
    onAssigneeChange: params.onAssigneeChange,
    onTagAssign: params.onTagAssign,
  });
  const { chipContext, writeStatus } = core;
  const areaPaths = collectBoardAreaPaths(root, context, typeMap, core.metrics.boardColumns);
  const itemAreaPaths = collectItemAreaPaths(root, context, typeMap, core.metrics.boardColumns);

  // Late-bound because the root's own commands have to repaint the tree AND re-label the header, and
  // neither exists until after the call below that consumes this handler.
  let onRootChanged: () => void = () => {};
  // The header is assembled before the tree renderer. Synchronous setup replaces this before the
  // first user event can arrive, mirroring the root-command callback directly above.
  let onAreaPathChange: () => void = () => {};

  const { header, setHeaderTitle, sprintPickerHandle, expandAll, collapseAll, refresh, techLead } =
    mountBoardHeader({
      doc,
      root,
      context,
      typeMap,
      sprintWindow,
      itemAreaPaths,
      areaPaths,
      session,
      core,
      folderPath,
      contextMenu,
      onRootChanged: () => onRootChanged(),
      onAreaPathChange: () => onAreaPathChange(),
    });
  refresh.element.onclick = () => params.onRefresh();
  board.append(header);

  const { renderTreeContent, refreshFilters } = mountBoardBody({
    doc,
    root,
    context,
    typeMap,
    session,
    board,
    sprintPickerHandle,
    chipContext,
    contextMenu,
    sprintWindow,
    areaPaths: itemAreaPaths,
    core,
    expandAll,
    collapseAll,
  });

  renderTreeContent();
  core.setRepaint(renderTreeContent);
  onAreaPathChange = renderTreeContent;
  // The header is painted once and is not part of a tree pass, so the root's own title has to be
  // re-labelled here; the tree still repaints because the root's sprint reaches its children's rows,
  // and the filter row because the root can be flagged from this menu like any other item.
  onRootChanged = () => {
    setHeaderTitle(root.title);
    refreshFilters();
    renderTreeContent();
  };
  wireSprintPickerRerender(sprintPickerHandle, session, renderTreeContent);

  return {
    element: board,
    applyCrewMembers: (members) => {
      applyFeatureCrewTags([root], members);
      // The header is not part of the tree re-render, so refresh the epic's TechLead in place.
      if (techLead) populateTechLead(techLead, root, chipContext);
      refreshFilters();
      renderTreeContent();
    },
    setReconcilePending: writeStatus.setReconcilePending,
    repaint: renderTreeContent,
    whenWritesSettled: () => core.writes.whenIdle(),
    setRefreshBusy: refresh.setBusy,
    setRefreshFailed: refresh.setFailed,
  };
}

/**
 * Renders an error scaffold for a validation failure.
 */
function renderValidationError(
  root: HTMLElement,
  doc: Document,
  message: string,
  extensionVersion: string | undefined,
): void {
  root.innerHTML = "";
  root.append(renderViewScaffold(doc, { title: "Project Tracking", message, extensionVersion }));
}

/**
 * The types a board may be rooted at: the planning context configured above Primary work.
 *
 * Any planning level qualifies, not only the top one. Teams name and nest their planning levels
 * differently, and plenty of them never create an Epic at all, so pinning the board to whichever
 * type happens to lead the catalog would refuse every query rooted one level down. A catalog with no
 * Primary work flagged has no planning context to derive, so the legacy rule stands in: a board is
 * rooted at a type that holds children, never at a leaf.
 */
function boardRootTypeNames(types: readonly TypeCatalogEntry[]): string[] {
  const planning = primaryWorkAncestors(types);
  const canRoot =
    planning.size > 0
      ? (type: TypeCatalogEntry): boolean => planning.has(type.name)
      : (type: TypeCatalogEntry): boolean => (type.children?.length ?? 0) > 0;
  return types.filter(canRoot).map(({ name }) => name);
}

/**
 * Validates root count and type. Returns the valid root or null if validation failed (error already rendered).
 */
function validateRoot(
  result: WorkItemTreeResult,
  root: HTMLElement,
  doc: Document,
  rootTypes: readonly string[],
  extensionVersion: string | undefined,
): TrackedWorkItem | null {
  const rootCount = result.roots.length;

  if (rootCount === 0) {
    renderValidationError(root, doc, "This query returned no items.", extensionVersion);
    return null;
  }

  if (rootCount > 1) {
    renderValidationError(
      root,
      doc,
      "This query must have exactly one root item.",
      extensionVersion,
    );
    return null;
  }

  const treeRoot = result.roots[0];
  if (!treeRoot) {
    renderValidationError(root, doc, "This query returned no items.", extensionVersion);
    return null;
  }

  // An empty list means the catalog says nothing about what can hold work, and refusing every query
  // on the strength of an unconfigured catalog helps nobody.
  if (rootTypes.length > 0 && !rootTypes.includes(treeRoot.type)) {
    renderValidationError(
      root,
      doc,
      `The root item must be a planning item (${rootTypes.join(", ")}).`,
      extensionVersion,
    );
    return null;
  }

  return treeRoot;
}

/**
 * Validates the tree result and renders an error scaffold if validation fails.
 *
 * Returns the validated root rather than a boolean: `validateRoot` has already established it, and
 * handing back only "it was fine" forces the caller to re-derive `result.roots[0]` behind a non-null
 * assertion — correct today only because of a fact the type system cannot see, and silently wrong
 * the day the validation rules change.
 */
function validateAndRenderErrors(
  result: WorkItemTreeResult,
  root: HTMLElement,
  doc: Document,
  services: EnhancedViewServices,
  extensionVersion: string | undefined,
): TrackedWorkItem | null {
  const rootTypes = boardRootTypeNames(services.getTypes());

  // Validation: log the conclusion exactly once.
  const isTreeQuery = result.isTreeQuery;
  const rootCount = result.roots.length;
  const rootType = result.roots[0]?.type;
  services.logger.info(
    `Project Tracking validation: isTreeQuery=${isTreeQuery}, rootCount=${rootCount}, rootType=${rootType ?? "N/A"}, allowedRootTypes=[${rootTypes.join(", ")}]`,
  );

  if (result.error) {
    renderValidationError(root, doc, result.error, extensionVersion);
    return null;
  }

  if (!isTreeQuery) {
    renderValidationError(
      root,
      doc,
      "Project Tracking requires a tree (work item links) query.",
      extensionVersion,
    );
    return null;
  }

  return validateRoot(result, root, doc, rootTypes, extensionVersion);
}

/**
 * Keeps the project's Feature Crew roster in sync with who is assigned. Seeded from everyone assigned
 * across the tree at load, then fed each inline assignee change so a freshly-picked person is added
 * right away. A write happens only when someone new appears; the writer is idempotent and preserves
 * the tags a developer set by hand. Writes are fire-and-forget — the writer already logs failures, so
 * a reconcile problem must never block the board.
 */
function createFeatureCrewSync(
  services: EnhancedViewServices,
  rootId: number,
  typeName: string,
  onReconciled: (members: FeatureCrewMember[]) => void,
  onUserWritePendingChange: (count: number) => void = () => {},
): {
  seed(roots: TrackedWorkItem[]): void;
  onAssigneeChange(user: DirectoryUser): void;
  setTag(user: TrackedUser, tag: string): void;
} {
  const known = new Set<string>();
  const assignees: FeatureCrewAssignee[] = [];

  // Serializes every reconcile so read-modify-writes on the shared roster item never race (see the
  // note in `reconcile`). Each call appends to this chain; a failure is caught INTO the chain so a
  // rejection can never poison every later reconcile.
  let reconcileChain: Promise<void> = Promise.resolve();

  // In-flight count of USER-triggered reconciles (tag picks / inline assignee changes) reported to
  // the board's "Saving…" indicator. The load-time seed reconcile is background housekeeping, not a
  // save the user is waiting on, so it is deliberately excluded.
  let userPending = 0;
  const bumpUserPending = (delta: number): void => {
    userPending += delta;
    onUserWritePendingChange(userPending);
  };

  const add = (assignee: FeatureCrewAssignee): boolean => {
    const key = assignee.alias.toLowerCase();
    if (known.has(key)) {
      return false;
    }
    known.add(key);
    assignees.push(assignee);
    return true;
  };

  const reconcile = (tagAssignments?: FeatureCrewTagAssignment[], userTriggered = false): void => {
    // Each reconcile is a read-modify-write against the one shared roster item, so they MUST run
    // strictly one-at-a-time. Left to race, the load-time seed reconcile (which knows nothing about a
    // tag the user just picked) can resolve after a setTag reconcile and repaint the pill with the
    // tag-less roster — and on a first-ever load two concurrent creates clobber each other so the tag
    // lands nowhere. Chaining every call onto the previous one makes the write atomic here: seed
    // finishes (creating the item) before setTag reads it, so a tag is never lost or reverted.
    //
    // Count a user-triggered save toward the "Saving…" indicator from the moment it is QUEUED (so the
    // spinner appears immediately, even while it waits behind another reconcile) until its chained
    // write settles — decremented in `finally` so a failure still clears the count.
    if (userTriggered) {
      bumpUserPending(1);
    }
    reconcileChain = reconcileChain
      .then(async () => {
        // Snapshot the roster at execution time so a call queued behind another still sends the
        // latest assignees.
        try {
          const result = await services.featureCrew.reconcile({
            rootId,
            typeName,
            assignees: [...assignees],
            tagAssignments,
          });
          if (result.ok && result.members) {
            onReconciled(result.members);
          }
        } finally {
          if (userTriggered) {
            bumpUserPending(-1);
          }
        }
      })
      // The CAUGHT promise becomes the chain. Catching a derived one instead would silence the
      // unhandled-rejection warning while leaving `reconcileChain` itself rejected, so every later
      // `.then` would short-circuit — no tag would ever save again, and the pending count would
      // climb forever because its `finally` would never run.
      .catch((error: unknown) => {
        services.logger.error(`Feature Crew reconcile failed for root ${rootId}`, error);
      });
  };

  return {
    seed(roots) {
      for (const assignee of collectFeatureCrewAssignees(roots)) {
        add(assignee);
      }
      reconcile();
    },
    onAssigneeChange(user) {
      add({
        alias: deriveAlias(user.uniqueName, user.displayName),
        fullName: user.displayName,
      });
      // Reconcile even when the person was already on the roster: the reconcile is what hands back
      // their crew tag, and without it a reassignment would leave the chip wearing the neutral "??"
      // pill (and the tag filter stale) until something else happened to refresh the board. Nothing
      // is written when nothing changed — the roster lookup alone answers with the current members.
      reconcile(undefined, true);
    },
    setTag(user, tag) {
      // The person is already assigned somewhere, so they are on the roster; record their chosen tag
      // and reconcile. The resolved roster then repaints every pill and refreshes the tag filter.
      const alias = deriveAlias(user.uniqueName, user.displayName);
      reconcile([{ alias, tag }], true);
    },
  };
}

/** Everything one load-and-render pass needs; shared by the first paint and by every refresh. */
interface RenderLoadedBoardParams {
  context: DataDrivenViewContext;
  /** The view's root element, whose content is replaced with the board (or with an error scaffold). */
  root: HTMLElement;
  services: EnhancedViewServices;
  result: WorkItemTreeResult;
  sprintWindow: SprintWindow;
  /** The reader's own state, carried across a refresh (see `BoardSession`). */
  session: BoardSession;
  /** Asked to re-read the board; wired onto the header's refresh button. */
  onRefresh: () => void;
}

/**
 * Renders the board once the tree and sprint window have loaded: validates the result, wires the
 * Feature Crew roster sync, builds the board, and kicks off the initial reconcile. Split out of the
 * view's `render` so that method stays a thin "create shell, load, then hand off" flow.
 *
 * The roster item is parked under the LAST configured type and linked to the root (the FIRST type);
 * with no types configured there is nowhere to store it, so the sync is skipped. When the reconcile
 * resolves it hands back the roster's tags, which the board projects onto every assignee.
 */
function renderLoadedBoard(params: RenderLoadedBoardParams): BoardHandle | null {
  const { context, root, services, result, sprintWindow, session } = params;
  // Remove title and loading, render error or board.
  root.innerHTML = "";

  const treeRoot = validateAndRenderErrors(
    result,
    root,
    context.doc,
    services,
    context.extensionVersion,
  );
  if (treeRoot === null) {
    return null;
  }
  retainBoardCaches(session, treeRoot);

  const types = services.getTypes();
  const typeMap = new Map(types.map((t) => [t.name, t]));

  const lastTypeName = types[types.length - 1]?.name;
  // The board is rendered below; the reconcile callback needs it, so route through a mutable handle
  // that is filled in right after the board is built (the reconcile can only resolve after this
  // synchronous setup, so the handle is always ready by the time it fires).
  let applyCrewMembers: (members: FeatureCrewMember[]) => void = () => {};
  // Same mutable-handle pattern as applyCrewMembers: the board is built below, so route the
  // reconcile-pending signal through a handle filled in right after, letting a user-triggered
  // reconcile drive the board's shared "Saving…" indicator.
  let reportReconcilePending: (count: number) => void = () => {};
  const crewSync =
    lastTypeName === undefined
      ? null
      : createFeatureCrewSync(
          services,
          treeRoot.id,
          lastTypeName,
          (members) => applyCrewMembers(members),
          (count) => reportReconcilePending(count),
        );
  const onAssigneeChange = (user: DirectoryUser): void => {
    crewSync?.onAssigneeChange(user);
  };
  // Only offer tag editing when a roster can actually be stored (a crew sync exists); otherwise the
  // pills stay read-only rather than pretending to persist a choice that has nowhere to go.
  const onTagAssign = crewSync
    ? (user: TrackedUser, tag: string): void => crewSync.setTag(user, tag)
    : null;

  const board = renderBoard({
    doc: context.doc,
    root: treeRoot,
    viewRoot: root,
    context,
    typeMap,
    sprintWindow,
    session,
    onAssigneeChange,
    onTagAssign,
    folderPath: result.folderPath ?? [],
    onRefresh: params.onRefresh,
  });
  applyCrewMembers = board.applyCrewMembers;
  reportReconcilePending = board.setReconcilePending;
  root.append(board.element);

  // Reconcile once now the whole tree is known (create-if-missing, append any new assignees); its
  // resolved roster then paints the assignee tags and fills the tag filter panel.
  crewSync?.seed([treeRoot]);
  return board;
}

/** Keep session caches bounded to the work items still returned by the refreshed query. */
function retainBoardCaches(session: BoardSession, root: TrackedWorkItem): void {
  const workItemIds = new Set<number>();
  const pending = [root];
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) break;
    workItemIds.add(item.id);
    pending.push(...item.children);
  }
  for (const workItemId of session.notePanelStates.keys()) {
    if (!workItemIds.has(workItemId)) session.notePanelStates.delete(workItemId);
  }
  session.recentNotes.retain(workItemIds);
}

/** Renders the load-failure scaffold when the tree read rejects; the error is logged first. */
function renderTreeLoadFailure(
  context: EnhancedViewContext,
  root: HTMLElement,
  services: EnhancedViewServices,
  err: unknown,
): void {
  services.logger.error("Project Tracking failed to load its tree", err);
  root.innerHTML = "";
  root.append(
    renderViewScaffold(context.doc, {
      title: "Project Tracking",
      message: "Could not load this query.",
      extensionVersion: context.extensionVersion,
    }),
  );
}

/**
 * The nearest ancestor that scrolls, or null when nothing above this element does.
 *
 * The view is mounted inside the enhanced surface's scrolling overlay rather than in the document's
 * own scroller, so "where the reader is" lives on an ancestor, not on the window. Walking up to find
 * it keeps this independent of how that host happens to be built.
 */
function scrollableAncestorOf(element: HTMLElement): HTMLElement | null {
  const view = element.ownerDocument.defaultView;
  if (view === null) {
    return null;
  }
  let current = element.parentElement;
  while (current !== null) {
    const overflowY = view.getComputedStyle(current).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Remembers where the reader is scrolled to so that replacing the board's DOM does not also move
 * them: without it, a refresh would answer "show me the latest" by silently jumping the reader back
 * to the top of a board they were reading half-way down.
 */
function captureScroll(element: HTMLElement): () => void {
  const scroller = scrollableAncestorOf(element);
  const top = scroller?.scrollTop ?? 0;
  return () => {
    if (scroller !== null) {
      scroller.scrollTop = top;
    }
  };
}

/**
 * Drives one query's board for the life of the page: the first read, and every refresh after it.
 *
 * The refresh loop lives here rather than inside a board because a refresh REPLACES the board — the
 * thing that has to outlive it (the reader's session state, and the hook the next board's button is
 * wired to) cannot be owned by the thing being thrown away.
 */
function startProjectTrackingBoard(context: DataDrivenViewContext, root: HTMLElement): void {
  const services = context.services;
  const session = createBoardSession(services);
  let board: BoardHandle | null = null;
  let refreshing = false;
  // Set when a re-read failed: the board on screen is still truthful, just older than the reader
  // asked for, and the button is the only place that can say so.
  let showingStaleBoard = false;

  // The tree and the sprint window are independent reads, so fire both together and render once
  // both resolve; the picker opens populated. A sprint-window failure resolves to an empty window
  // (the filter is simply left disabled) and never blocks the board.
  const load = (): Promise<[WorkItemTreeResult, SprintWindow]> =>
    Promise.all([services.loadTree(context.queryId), services.loadSprintWindow()]);

  const paint = ([result, sprintWindow]: [WorkItemTreeResult, SprintWindow]): void => {
    board = renderLoadedBoard({
      context,
      root,
      services,
      result,
      sprintWindow,
      session,
      onRefresh: () => requestRefresh(),
    });
    if (board !== null) {
      resolveBoardMentions(services, result.roots, board.repaint);
      void loadInterruptAcceptanceState(result.roots, services)
        .then((acceptance) => {
          const changed =
            acceptance.acceptedIds.size !== session.interruptAcceptance.acceptedIds.size ||
            [...acceptance.acceptedIds].some(
              (workItemId) => !session.interruptAcceptance.acceptedIds.has(workItemId),
            );
          session.interruptAcceptance = acceptance;
          if (changed) board?.repaint();
        })
        .catch((error: unknown) => {
          services.logger.error("Project Tracking could not resolve interrupt acceptance", error);
        });
    }
  };

  const reportRefreshFailure = (error: unknown): void => {
    // Deliberately NOT swapped for the load-failure scaffold: the board on screen is still a
    // truthful, if older, picture, and trading it for "Could not load this query." because one fetch
    // failed would cost the reader everything they had open for no gain.
    services.logger.error("Project Tracking could not refresh its board", error);
    showingStaleBoard = true;
    board?.setRefreshFailed(true);
  };

  const requestRefresh = (): void => {
    if (refreshing) {
      return;
    }
    if (showingStaleBoard) {
      // The button is reporting a failed re-read, so this press is the reader asking WHY, not asking
      // again. Hand them the recorded cause and clear the report; the next press refreshes.
      showingStaleBoard = false;
      board?.setRefreshFailed(false);
      services.logger.info("Project Tracking refresh failure: opening the diagnostics log");
      services.openDiagnosticsLog();
      return;
    }
    refreshing = true;
    board?.setRefreshBusy(true);
    services.logger.info(`Project Tracking refresh requested for query ${context.queryId}`);
    // Queued writes are awaited FIRST: a re-read that overtakes one is answered with the value the
    // user just replaced, which paints their edit as though it had been lost.
    void (board?.whenWritesSettled() ?? Promise.resolve())
      .then(load)
      .then((loaded) => {
        const restoreScroll = captureScroll(root);
        paint(loaded);
        restoreScroll();
      })
      .catch(reportRefreshFailure)
      .finally(() => {
        refreshing = false;
        board?.setRefreshBusy(false);
      });
  };

  load()
    .then(paint)
    .catch((err: unknown) => renderTreeLoadFailure(context, root, services, err));
}

/**
 * The Project Tracking view renderer: a live tree board with sprint filtering, expand/collapse, and description toggles.
 */
export const projectTrackingView: EnhancedView = {
  id: projectTrackingViewType.id,
  dispose: (root) => modifierHighlightTracker(root.ownerDocument).unregister(root),
  render: (context) => {
    const root = context.doc.createElement("section");
    root.className = "awesomeado-view awesomeado-tracking";
    modifierHighlightTracker(context.doc).register(root);
    // Trim the top padding to 2px so the (sticky) header card sits close to the top ADO bar; the
    // sides and bottom use the board's shared edge padding. The board below adds its own matching
    // top padding.
    root.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "min-height:100%",
      "box-sizing:border-box",
      "font-family:inherit",
      "color:var(--text-primary-color)",
      "text-align:left",
      `padding:2px ${BOARD_EDGE_PADDING_PX}px ${BOARD_EDGE_PADDING_PX}px`,
    ].join(";");

    // Render title immediately so it's available synchronously for tests.
    const title = context.doc.createElement("h1");
    title.className = "awesomeado-view__title";
    title.textContent = "Project Tracking";
    title.style.cssText = "margin:0 0 16px 0;font-size:24px;font-weight:600";
    root.append(title);

    const services = context.services;
    if (!services) {
      const message = context.doc.createElement("p");
      message.textContent = "Data services are unavailable.";
      message.style.cssText = "margin:0;opacity:0.8";
      root.append(message);
      return root;
    }
    // The ONE place this view checks for its services. Everything below takes
    // `DataDrivenViewContext`, so no helper re-checks and none can be tempted into a non-null
    // assertion when a check is inconvenient.
    const dataContext: DataDrivenViewContext = { ...context, services };

    const loading = context.doc.createElement("div");
    loading.className = "awesomeado-tracking__loading";
    loading.textContent = "Loading…";
    // Themed loading text so it reads on any theme.
    loading.style.cssText = [
      "padding:16px 0",
      "text-align:center",
      "color:var(--text-secondary-color)",
    ].join(";");
    root.append(loading);

    startProjectTrackingBoard(dataContext, root);

    return root;
  },
};

/**
 * Resolve the `@`-mentions in the board's descriptions, then repaint so they show as names.
 *
 * Deliberately AFTER the first paint rather than before it: the identity ids only exist once the
 * tree is in hand, so awaiting the lookup first would hold the whole board back on a cosmetic
 * detail. One bulk read covers every description on the board (see `IMentionDirectory`), and the
 * repaint only happens when it actually learned something — a repaint that changes nothing is a
 * flicker the reader paid for.
 */
function resolveBoardMentions(
  services: EnhancedViewServices,
  roots: readonly TrackedWorkItem[],
  repaint: () => void,
): void {
  const knownBefore = services.mentionDirectory.knownNames().size;
  resolveMentionsIn(services.mentionDirectory, describedTexts(roots))
    .then((names) => {
      if (names.size > knownBefore) {
        repaint();
      }
    })
    .catch((error: unknown) => {
      // The directory's contract is that it never rejects, so arriving here means a collaborator
      // broke it; the board keeps its placeholder mentions rather than losing its repaint.
      services.logger.error("Could not resolve the board's @-mentions", error);
    });
}

/** Every description in the tree, so one bulk read can resolve all their `@`-mentions together. */
function describedTexts(roots: readonly TrackedWorkItem[]): string[] {
  const texts: string[] = [];
  const pending = [...roots];
  while (pending.length > 0) {
    const item = pending.pop()!;
    texts.push(item.description);
    pending.push(...item.children);
  }
  return texts;
}
