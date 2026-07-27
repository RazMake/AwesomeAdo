import {
  applyFeatureCrewTags,
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
import { ASSIGNED_TO_FIELD, identityFieldValue } from "../../../common/ado/adoApi";
import { buildQueryFolderUrl, buildWorkItemUrl } from "../../../common/ado/fetchAdoTree";
import type { SprintWindow } from "../../../common/ado/sprintWindow";
import { resolveMentionsIn } from "../../../common/browser/MessagingMentionDirectory";
import {
  MANUAL_ORDERING_POLICY,
  orderItems,
  type OrderingPolicy,
} from "../../../common/ordering/ItemOrdering";
import type {
  DataDrivenViewContext,
  EnhancedView,
  EnhancedViewContext,
  EnhancedViewServices,
} from "../../../common/view-common/EnhancedView";
import {
  renderAssignedTo,
  type AssignedToHandle,
} from "../../../common/view-common/control/AssignedTo/AssignedTo";
import {
  renderChildItemsBadge,
  type ChildItemDescriptor,
} from "../../../common/view-common/control/ChildItemsBadge/ChildItemsBadge";
import {
  renderEtaBadge,
  type EtaBadgeHandle,
} from "../../../common/view-common/control/EtaBadge/EtaBadge";
import { renderItemLifecycleInfo } from "../../../common/view-common/control/ItemLifecycleInfo/ItemLifecycleInfo";
import {
  renderItemTypeIcon,
  type ItemTypeIconEmphasis,
} from "../../../common/view-common/control/ItemTypeIcon/ItemTypeIcon";
import { renderMarkdownText } from "../../../common/view-common/control/MarkdownText/MarkdownText";
import { renderOrderingPicker } from "../../../common/view-common/control/OrderingPicker/OrderingPicker";
import {
  renderSprintPicker,
  type SprintPickerHandle,
} from "../../../common/view-common/control/SprintPicker/SprintPicker";
import { renderStatusBadge } from "../../../common/view-common/control/StatusBadge/StatusBadge";
import { renderViewScaffold } from "../../../common/view-common/control/ViewScaffold/ViewScaffold";
import { renderWriteQueueStatus } from "../../../common/view-common/control/WriteQueueStatus/WriteQueueStatus";

import { DragReorderController, type PlannedMove } from "./drag-reorder/DragReorderController";
import { applyMoveToTree, applyRanksToTree } from "./drag-reorder/applyMoveToTree";
import {
  renderProjectTrackingHeader,
  type RefreshButtonHandle,
} from "./header/ProjectTrackingHeader";
import { renderNotesPanel } from "./notes/NotesPanel";
import {
  hideResolvedAfterDays,
  orderingPolicyOf,
  projectTrackingViewType,
  updatesWindowWeeks,
} from "./projectTrackingViewType";
import { renderTagFilterPanel } from "./tag-filter/TagFilterPanel";

/**
 * Returns the hex color for a given work item type name, or null when not found.
 * The color in TypeCatalogEntry is stored WITHOUT the '#' prefix.
 */
function typeColorOf(typeName: string, typeMap: Map<string, TypeCatalogEntry>): string | null {
  const entry = typeMap.get(typeName);
  return entry ? `#${entry.color}` : null;
}

/**
 * The hex color (with `#`) of the LAST configured work item type — the bottom of the hierarchy —
 * or null when no type is configured or that type carries no color. Returned separately from
 * `typeColorOf` because the rollup badge is keyed off the hierarchy's position, not off any
 * particular item's own type.
 */
function lastTypeColor(types: TypeCatalogEntry[]): string | null {
  const color = types[types.length - 1]?.color ?? "";
  return color.length > 0 ? `#${color}` : null;
}

/**
 * Maps a work item's ADO State (System.State) to the application Status — the board-column label it
 * is routed onto. Falls back to the raw ADO State when the type declares no matching column, so an
 * unmapped state is still shown rather than blanked.
 */
function statusLabelOf(item: TrackedWorkItem, entry: TypeCatalogEntry | undefined): string {
  // Match case/whitespace-insensitively: ADO can echo a state with different casing than the one the
  // team recorded in its column config, and an exact compare would then miss the mapping and leak the
  // raw ADO State into the badge instead of the intended application Status.
  const itemState = item.state.trim().toLowerCase();
  const column = entry?.columns.find((col) =>
    col.states.some((state) => state.trim().toLowerCase() === itemState),
  );
  return column?.column ?? item.state;
}

/**
 * The tag a work item filters under: its assignee's tag (`null` = the "??" untagged bucket), or
 * `undefined` when the item is unassigned so no tag pill ever matches it. Mirrors how
 * `collectAssignedTags` buckets people, so a selected pill and the tree agree on who wears it.
 */
function itemTagKey(item: TrackedWorkItem): string | null | undefined {
  if (item.assignedTo === null) {
    return undefined;
  }
  const tag = item.assignedTo.tag;
  return tag !== undefined && tag !== null && tag.length > 0 ? tag : null;
}

/**
 * Everything one render pass narrows the tree by, bundled so the recursive visibility test and the
 * rollup badge apply exactly the same rules and can never fall out of step.
 */
interface TreeFilter {
  /** The sprint the board is filtered to, or null when the sprint filter is off. */
  sprint: string | null;
  /** The active Feature Crew tag filter (empty = everyone); `null` is the untagged "??" bucket. */
  tags: Set<string | null>;
  /** True once an item has sat in the resolved column longer than the binding's window allows. */
  isResolvedPastWindow(item: TrackedWorkItem): boolean;
}

/**
 * Predicate: is this item (or any of its descendants) visible under the active filters? An item
 * self-matches when it passes the sprint filter, the tag filter (an empty selection passes; multiple
 * selected tags form an OR) AND has not been resolved for longer than the binding allows. An ancestor
 * stays visible when any descendant self-matches, so a matching item is never orphaned from its path
 * — which is also what keeps a long-resolved parent on the board while unresolved work sits beneath it.
 */
function isVisibleUnderFilter(item: TrackedWorkItem, filter: TreeFilter): boolean {
  const matchesSprint = !filter.sprint || item.sprintName === filter.sprint;
  const key = itemTagKey(item);
  const matchesTag = filter.tags.size === 0 || (key !== undefined && filter.tags.has(key));
  if (matchesSprint && matchesTag && !filter.isResolvedPastWindow(item)) return true;
  return item.children.some((child) => isVisibleUnderFilter(child, filter));
}

/**
 * Orders one level of the tree by the binding's policy.
 *
 * `common/ordering` owns what each policy means, so this only adapts a tracked item to what it asks
 * for: an item stores its ETA as an ISO string, but the policy compares epoch milliseconds. The
 * ordered wrappers are unwrapped back to the items, so the caller still renders the real nodes.
 */
function orderTrackedItems(items: TrackedWorkItem[], policy: OrderingPolicy): TrackedWorkItem[] {
  const orderable = items.map((item) => ({
    item,
    importance: item.importance,
    title: item.title,
    eta: epochOf(item.eta),
  }));
  return orderItems(orderable, policy).map((entry) => entry.item);
}

/** An ISO timestamp as epoch milliseconds; null when absent or unparseable. */
function epochOf(iso: string | null): number | null {
  if (iso === null) {
    return null;
  }
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Builds the meta line for the description panel: "Created on: <date>, Last Modified on: <date>".
 * The actor's name lives in each label's "By <name>" tooltip (via ItemLifecycleInfo) to keep the
 * line compact; DateLabel elements are appended, never innerHTML.
 */
function buildMetaLine(
  doc: Document,
  item: TrackedWorkItem,
): { container: HTMLElement; dateElements: number } {
  const meta = doc.createElement("div");
  meta.className = "awesomeado-tracking__meta";
  // Muted text color from ADO theme so the meta line reads on both light and dark themes.
  meta.style.cssText = [
    "font-size:11px",
    "color:var(--text-secondary-color, #8a8886)",
    "margin-bottom:8px",
  ].join(";");

  meta.append(
    renderItemLifecycleInfo(doc, {
      event: "created",
      timestamp: item.createdDate,
      user: item.createdBy,
    }),
  );
  meta.append(doc.createTextNode(", "));
  meta.append(
    renderItemLifecycleInfo(doc, {
      event: "last-modified",
      timestamp: item.changedDate,
      user: item.changedBy,
    }),
  );

  return { container: meta, dateElements: 2 };
}

/**
 * Renders the description panel (initially hidden) for a work item row.
 * Returns the panel element plus the toggle button that controls its visibility.
 */
function renderDescription(
  doc: Document,
  item: TrackedWorkItem,
  mentionNames: ReadonlyMap<string, string>,
): { panel: HTMLElement; toggleButton: HTMLButtonElement } {
  const toggleButton = doc.createElement("button");
  toggleButton.className = "awesomeado-tracking__describe";
  toggleButton.type = "button";
  toggleButton.textContent = "?";
  toggleButton.setAttribute("aria-expanded", "false");
  // Small, muted disc: a fixed mid-grey (not a theme surface token) so it is always distinct from
  // the page background yet never bright enough to pull attention from the title — identical on every
  // theme, including Follow ADO where surface tokens can collapse into the page color and hide both
  // the disc and its margin.
  toggleButton.style.cssText = [
    "cursor:pointer",
    "border:1px solid var(--palette-neutral-20, rgba(255,255,255,0.6))",
    "border-radius:50%",
    "width:16px",
    "height:16px",
    "background:rgba(128,128,128,0.55)",
    "font-size:10px",
    "font-weight:bold",
    "color:var(--text-on-communication-background, #fff)",
    "padding:2",
    "margin:1px",
  ].join(";");

  const panel = doc.createElement("div");
  panel.className = "awesomeado-tracking__description";
  panel.style.cssText = "display:none;margin-top:8px;padding-left:39px";

  const { container: meta } = buildMetaLine(doc, item);
  panel.append(meta);

  const descText = renderMarkdownText(doc, { text: item.description, mentionNames });
  descText.classList.add("awesomeado-tracking__desc-text");
  // Themed primary text color for description text; the control itself owns the rest of the look.
  descText.style.fontSize = "11px";
  descText.style.color = "var(--text-primary-color, #323130)";
  panel.append(descText);

  toggleButton.addEventListener("click", () => {
    const isOpen = toggleButton.getAttribute("aria-expanded") === "true";
    toggleButton.setAttribute("aria-expanded", isOpen ? "false" : "true");
    panel.style.display = isOpen ? "none" : "block";
  });

  return { panel, toggleButton };
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
 * The zero-based position of a status label in the team's global board-column order, or -1 when the
 * label maps to no board column. Status color is keyed off this position so the same board column
 * reads identically for every work-item type. Matched case/whitespace-insensitively because ADO can
 * echo a column label with different casing than the team recorded.
 */
function boardColumnOrdinal(label: string, boardColumns: string[]): number {
  const target = label.trim().toLowerCase();
  return boardColumns.findIndex((column) => column.trim().toLowerCase() === target);
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
      queue
        .enqueue({
          id: item.id,
          currentRev: () => item.rev,
          field: ASSIGNED_TO_FIELD,
          value: identityFieldValue(picked),
        })
        .then((result) => {
          if (!result.ok || result.rev === undefined) {
            return;
          }
          // A freshly assigned person has no known crew tag until the roster reconcile answers, so
          // the chip shows the neutral "??" pill in the meantime rather than the previous person's.
          item.assignedTo = {
            displayName: picked.displayName,
            uniqueName: picked.uniqueName,
            imageUrl: picked.imageUrl,
            tag: null,
          };
          item.rev = result.rev;
          chip.handle?.setUser(item.assignedTo);
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
  /** What narrows the tree on this pass: the sprint, the tags, and the resolved-age window. */
  filter: TreeFilter;
  /** How the items within each level are ordered, straight from the binding. */
  orderingPolicy: OrderingPolicy;
  showSprintPills: boolean;
  /** How every assignee chip on this pass offers people and persists a pick. */
  chip: AssigneeChipContext;
  /** Collects every expandable row rendered in this pass so expand-all/collapse-all can drive them. */
  expandableRows: ExpandableRow[];
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

/**
 * How many levels below the root render as their own rows: the root's children (depth 0) and their
 * children (depth 1). Anything deeper is detail that buries the plan, so it is rolled up into a
 * single badge on the deepest row instead of extending the outline.
 */
const MAX_ROW_DEPTH = 1;

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
    const status = statusLabelOf(item, typeMap.get(item.type));
    if (boardColumnOrdinal(status, boardColumns) !== resolvedOrdinal) {
      return false;
    }
    const resolvedAt = epochOf(item.stateChangeDate);
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
  const rowWrapper = twisty.closest(".awesomeado-tracking__row")?.parentElement;
  const container = rowWrapper?.querySelector(".awesomeado-tracking__children");
  return container instanceof HTMLElement ? container : null;
}

/**
 * Creates the row controls: the fixed tree gutter (twisty or spacer) and the editable status badge.
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
): { gutter: HTMLElement; stateBadge: HTMLElement; twisty: HTMLButtonElement | null } {
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
      "color:var(--text-primary-color, #323130)",
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
            // Reflect the new Status label and re-tint to its board-column ordinal so the badge's
            // color tracks the label (the badge owns its own coloring).
            stateBadge.setStatus(column, boardColumnOrdinal(column, boardColumns));
          }
        });
    },
  });
  // The badge flows inline at the head of the content block, so it sits on the same line as the
  // title/?/assignee and wraps together with them; middle-align it to the text line and give it a
  // little breathing room before the title.
  stateBadge.style.verticalAlign = "middle";
  stateBadge.style.marginRight = "6px";

  return { gutter, stateBadge, twisty };
}

/**
 * Creates the row title and description controls.
 */
function createTitleControls(
  doc: Document,
  item: TrackedWorkItem,
  typeMap: Map<string, TypeCatalogEntry>,
  mentionNames: ReadonlyMap<string, string>,
): { titleSpan: HTMLElement; descButton: HTMLButtonElement; descPanel: HTMLElement } {
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

  const { panel: descPanel, toggleButton: descButton } = renderDescription(doc, item, mentionNames);
  // The ? disc leads the row's controls, ahead of the type icon and the title, so every row's disc
  // sits in the same column instead of at whatever point that row's title happens to end on.
  // vertical-align:middle keeps it centered on the text line.
  descButton.style.display = "inline-flex";
  descButton.style.verticalAlign = "middle";
  descButton.style.margin = "0 4px";

  return { titleSpan, descButton, descPanel };
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
): { toggle: HTMLElement; panel: HTMLElement } {
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
    emphasis: noteEmphasis(startsExpanded, hasNotes),
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

  const notes = renderNotesPanel({
    doc,
    workItemId: item.id,
    sinceIso: options.notesSinceIso,
    loader: services.noteLoader,
    writer: services.noteWriter,
    mentionDirectory: services.mentionDirectory,
    logger: services.logger,
    onNoteCountKnown: (count) => {
      hasNotes = count > 0;
      // Written back to the model so a later repaint seeds from the truth rather than from ADO's
      // total again — otherwise an item whose notes all fall outside the window would flick back to
      // "has notes" on every re-sort.
      item.noteCount = count;
      icon.setEmphasis(noteEmphasis(toggle.getAttribute("aria-expanded") === "true", hasNotes));
    },
  });

  const apply = (expanded: boolean): void => {
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.title = notesToggleTitle(expanded, hasNotes, item.type);
    icon.setEmphasis(noteEmphasis(expanded, hasNotes));
    notes.setExpanded(expanded);
  };
  apply(startsExpanded);

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") !== "true";
    if (expanded) {
      options.expandedNoteIds.add(item.id);
    } else {
      options.expandedNoteIds.delete(item.id);
    }
    apply(expanded);
  });

  return { toggle, panel: notes.element };
}

/** How loudly a row's type icon renders: open beats "has something", which beats "nothing here". */
function noteEmphasis(expanded: boolean, hasNotes: boolean): ItemTypeIconEmphasis {
  if (expanded) {
    return "full";
  }
  return hasNotes ? "muted" : "quiet";
}

/**
 * The toggle's tooltip. It names what the icon's shade already says, because a colour difference is
 * a hint rather than a statement — and it is the only form of it available to a screen reader.
 */
function notesToggleTitle(expanded: boolean, hasNotes: boolean, typeName: string): string {
  if (expanded) {
    return `Hide notes — ${typeName}`;
  }
  return hasNotes ? `Show notes — ${typeName}` : `No notes — ${typeName}`;
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
        queue
          .enqueue({ id: item.id, currentRev: () => item.rev, field: etaField, value: newEta })
          .then((result) => {
            if (result.ok && result.rev !== undefined) {
              item.eta = newEta;
              item.rev = result.rev;
              badge.handle?.setEta(newEta);
            }
          });
      }
    : undefined;
  badge.handle = renderEtaBadge(doc, { eta: item.eta, now, onChange });
  return badge.handle;
}

/**
 * Describes one rolled-up child for the badge's popup: its assignee chip, type-colored title, its own
 * editable ETA badge, and the type icon that deep-links the item in ADO. The assignee and ETA controls
 * are built with the SAME helpers the tree rows use, so a rolled-up child is reassigned and re-dated
 * exactly like a row rather than being a read-only echo.
 */
function describeMinorChild(
  child: TrackedWorkItem,
  options: TreeRenderOptions,
): ChildItemDescriptor {
  const { doc, typeMap, queue, context } = options;
  const icon = typeMap.get(child.type)?.icon ?? "";
  return {
    // The rollup popup is a dense one-line-per-child list, so the crew tag pill is left off here —
    // the tag is edited from the tree row that owns the person.
    assignee: createItemAssignee(child, options.chip, false),
    title: child.title,
    titleColor: typeColorOf(child.type, typeMap),
    eta: createItemEtaBadge(doc, child, typeMap, queue, context.services.now()),
    iconUrl: icon.length > 0 ? icon : null,
    // The view runs on the ADO query page, so the page's own URL supplies the org/project the item
    // link resolves against; an unrecognizable location leaves the affordance inert.
    url: buildWorkItemUrl(doc.location?.href ?? "", child.id),
  };
}

/**
 * Rolls a row's children up into a single "completed / total" badge, or null when there is nothing
 * to summarize. Only children that survive the active filters are counted or listed, so the rollup
 * always agrees with what the board claims to be showing — including the resolved-age window, so a
 * child hidden from the outline is not still counted here.
 */
function createMinorChildrenBadge(
  item: TrackedWorkItem,
  options: TreeRenderOptions,
): HTMLElement | null {
  const { typeMap, boardColumns, filter } = options;

  const visible = orderTrackedItems(
    item.children.filter((child) => isVisibleUnderFilter(child, filter)),
    options.orderingPolicy,
  );
  if (visible.length === 0) return null;

  const completedOrdinal = completedColumnOrdinal(boardColumns);
  const completedCount = visible.filter(
    (child) =>
      boardColumnOrdinal(statusLabelOf(child, typeMap.get(child.type)), boardColumns) ===
      completedOrdinal,
  ).length;

  const badge = renderChildItemsBadge(options.doc, {
    children: visible.map((child) => describeMinorChild(child, options)),
    completedCount,
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

/**
 * Creates the row right-side controls. The assignee, sprint pill and rolled-up child badge flow
 * inline right after the title (returned in `inline`); the ETA is pinned to the row's far right
 * (returned separately).
 */
function createRowRightControls(
  item: TrackedWorkItem,
  options: TreeRenderOptions,
  showsChildRows: boolean,
): { inline: HTMLElement[]; eta: HTMLElement | null } {
  const { doc, context, typeMap, queue, showSprintPills } = options;
  const inline: HTMLElement[] = [];

  inline.push(createRowAssignee(item, options));

  if (showSprintPills && isLeafSprint(item)) {
    const pill = doc.createElement("span");
    pill.className = "awesomeado-tracking__sprint-pill";
    pill.textContent = item.sprintName;
    // Themed sprint pill: subtle fill and discrete border so it reads on any theme.
    pill.style.cssText = [
      "display:inline-block",
      "vertical-align:middle",
      "border:1px solid var(--palette-neutral-20, #ddd)",
      "border-radius:3px",
      "padding:2px 6px",
      "margin-left:6px",
      "font-size:9px",
      "background:var(--palette-neutral-4, rgba(128,128,128,0.08))",
      "color:var(--text-primary-color, #323130)",
      "white-space:nowrap",
    ].join(";");
    inline.push(pill);
  }

  // The deepest rendered row carries its children as a rollup badge instead of an expandable branch.
  if (!showsChildRows) {
    const minorChildren = createMinorChildrenBadge(item, options);
    if (minorChildren) {
      inline.push(minorChildren);
    }
  }

  const etaBadge = createItemEtaBadge(doc, item, typeMap, queue, context.services.now());
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
 * Renders a single work item row with all its controls (twisty, state, title, assignee, sprint pill,
 * rolled-up child badge, ETA). Returns the row element, the children container, and the twisty
 * button (null when the row has no expandable child rows).
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
  /** The title, which doubles as the drag handle when reordering is available. */
  title: HTMLElement;
} {
  const { doc, typeMap } = options;
  // Past the last rendered level a row's children become a rollup badge, not an expandable branch.
  const showsChildRows = depth < MAX_ROW_DEPTH;

  const row = doc.createElement("div");
  row.className = "awesomeado-tracking__row";
  // The row never wraps: the ETA stays pinned to the far right (via its own auto margin) so it always
  // reads at the vertical center of the row's FIRST line. align-items:flex-start top-aligns the
  // fixed gutter, the content block (which wraps the title internally) and the ETA, and because those
  // three share the same first-line box height their vertical centers coincide with the first line.
  row.style.cssText = ["display:flex", "align-items:flex-start", "gap:8px", "padding:4px 0"].join(
    ";",
  );

  const { gutter, stateBadge, twisty } = createRowControls(item, options, showsChildRows);
  row.append(gutter);

  const { titleSpan, descButton, descPanel } = createTitleControls(
    doc,
    item,
    typeMap,
    options.mentionNames,
  );
  const notes = createItemNotes(item, options);
  const { inline, eta } = createRowRightControls(item, options, showsChildRows);

  // Status badge, ? disc, type icon, title and assignee share ONE inline-flow block so they read as
  // a single line. Because they flow as inline content (not rigid flex items) they pack tightly and
  // wrap together, so the assignee always hugs the end of the wrapped title instead of drifting to a
  // stretched box's right edge. The block grows and shrinks (flex:1 1 auto) and wraps the title
  // INTERNALLY; the row itself never wraps, so the ETA stays to the right. The status badge is the
  // first inline child (vertical-align:middle) so it sits at the center of the first line. A <span>
  // (not a <div>) keeps it out of the row's div-ancestor chain; as a flex item it is still
  // blockified, so its inline children wrap within it.
  const contentBlock = doc.createElement("span");
  contentBlock.className = "awesomeado-tracking__content";
  contentBlock.style.cssText = "flex:1 1 auto;min-width:0;line-height:1.8";
  contentBlock.append(stateBadge, descButton, notes.toggle, titleSpan, ...inline);
  row.append(contentBlock);

  if (eta) {
    // Auto margin pushes the ETA to the far right of the row; it top-aligns and shares the content's
    // 1.8em line-height, so it stays centered on the first line regardless of how many lines the
    // title wraps to below.
    eta.style.marginLeft = "auto";
    row.append(eta);
  }

  const childrenContainer = doc.createElement("div");
  childrenContainer.className = "awesomeado-tracking__children";
  // Each depth reads 10% smaller than its parent (90% compounds down the tree). The vertical guide
  // line is drawn ONLY under the top-level parents (depth 0); margin-left ~= half the twisty width so
  // the line sits centered under the parent's expand/collapse triangle. A fixed mid-grey keeps it
  // visible even under "Follow ADO", where ADO's --palette-neutral-20 is too faint to show.
  const childrenStyles = ["padding-left:2px", "margin-left:10px", "font-size:90%"];
  if (depth === 0) {
    childrenStyles.push("border-left:1px solid rgba(128,128,128,0.45)");
  }
  childrenContainer.style.cssText = childrenStyles.join(";");

  const rowWrapper = doc.createElement("div");
  rowWrapper.append(row, descPanel, notes.panel, childrenContainer);

  if (twisty) {
    wireTwisty(twisty, childrenContainer, item.id, options.collapsedIds);
  }

  return { row: rowWrapper, childrenContainer, twisty, line: row, title: titleSpan };
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
): void {
  setTwistyExpanded(twisty, childrenContainer, !collapsedIds.has(id));
  twisty.addEventListener("click", () => {
    const expanded = twisty.getAttribute("aria-expanded") !== "true";
    rememberExpanded(collapsedIds, id, expanded);
    setTwistyExpanded(twisty, childrenContainer, expanded);
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
 * Recursion stops at `MAX_ROW_DEPTH`: deeper items are summarized by the deepest row's rollup badge
 * (see `createMinorChildrenBadge`) instead of extending the outline.
 */
function renderTree(
  parent: TrackedWorkItem,
  options: TreeRenderOptions,
  depth: number,
): HTMLElement[] {
  const ordered = orderTrackedItems(parent.children, options.orderingPolicy);
  const siblingIds = ordered.map((item) => item.id);
  const visible = ordered.filter((item) => isVisibleUnderFilter(item, options.filter));
  return visible.map((item) => {
    const { row, childrenContainer, twisty, line, title } = renderRow(item, options, depth);
    if (twisty) options.expandableRows.push({ id: item.id, twisty });

    options.dragReorder?.register({
      id: item.id,
      depth,
      parentId: parent.id,
      siblingIds,
      handle: title,
      row: line,
      wrapper: row,
    });

    if (depth < MAX_ROW_DEPTH) {
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
  /** The active tag filter (OR across the entries; empty = everyone). `null` is the untagged bucket. */
  selectedTags: Set<string | null>;
  /** The sprint filter as the reader last left it, or null while they have not touched the picker. */
  sprint: { selectedName: string | null; filterActive: boolean } | null;
  /** The order the reader picked this session, or null while the binding's configured order applies. */
  orderingPolicy: OrderingPolicy | null;
}

/** A fresh session: nothing collapsed, nothing filtered, no pick that overrides the binding. */
function createBoardSession(): BoardSession {
  return {
    collapsedIds: new Set<number>(),
    expandedNoteIds: new Set<number>(),
    selectedTags: new Set<string | null>(),
    sprint: null,
    orderingPolicy: null,
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
  sprintWindow: SprintWindow,
  session: BoardSession,
  chipContext: AssigneeChipContext,
  boardControls: HeaderBoardControls,
  folderPath: QueryFolderCrumb[],
  queue: WorkItemWriteQueue,
): {
  header: HTMLElement;
  sprintPickerHandle: SprintPickerHandle;
  expandAll: HTMLButtonElement;
  collapseAll: HTMLButtonElement;
  refresh: RefreshButtonHandle;
  techLead: HTMLElement | null;
} {
  const sprintPickerHandle = renderSprintControls(doc, sprintWindow, session);
  const techLead = createTechLeadGroup(root, chipContext);

  // The view runs on the ADO query page, so the page's own URL supplies the org/project the folder
  // links resolve against; when it is not a recognizable ADO location the segment stays plain text
  // rather than pointing at a fabricated URL.
  const pageHref = doc.location?.href ?? "";

  const {
    element: header,
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
    techLead,
    eta: createItemEtaBadge(doc, root, typeMap, queue, context.services.now()),
    sprintPicker: sprintPickerHandle.element,
    orderingPicker: boardControls.orderingPicker,
    writeQueueStatus: boardControls.writeQueueStatus,
  });

  return { header, sprintPickerHandle, expandAll, collapseAll, refresh, techLead };
}

/**
 * Wires the expand/collapse-all button handlers.
 */
function wireExpandCollapseButtons(
  expandAll: HTMLButtonElement,
  collapseAll: HTMLButtonElement,
  rows: ExpandableRow[],
  collapsedIds: Set<number>,
): void {
  const setAllExpanded = (expanded: boolean) => () => {
    for (const { id, twisty } of rows) {
      // Recorded as well as applied: a repaint right after the click would otherwise undo it.
      rememberExpanded(collapsedIds, id, expanded);
      setTwistyExpanded(twisty, childrenContainerOf(twisty), expanded);
    }
  };

  expandAll.onclick = setAllExpanded(true);
  collapseAll.onclick = setAllExpanded(false);
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

/** Everything the board's tree + tag-filter renderer needs to (re)build both from current state. */
interface BoardTreeRendererParams {
  doc: Document;
  root: TrackedWorkItem;
  context: DataDrivenViewContext;
  typeMap: Map<string, TypeCatalogEntry>;
  /**
   * The reader's own state (collapsed nodes, opened discussions, tag filter). Owned OUTSIDE the
   * renderer so it survives both a repaint and a refresh — see `BoardSession`.
   */
  session: BoardSession;
  treeContainer: HTMLElement;
  tagPanelContainer: HTMLElement;
  sprintPickerHandle: SprintPickerHandle;
  chipContext: AssigneeChipContext;
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
}

/**
 * The board's two mutually-referencing renderers: `renderTreeContent` rebuilds the tree under the
 * current sprint + tag filters, and `refreshTagPanel` rebuilds the filter panel from the tags worn
 * across the tree. They are paired here because the panel's onChange re-runs both.
 */
function createBoardTreeRenderer(params: BoardTreeRendererParams): {
  renderTreeContent: () => void;
  refreshTagPanel: () => void;
} {
  const {
    doc,
    root,
    treeContainer,
    tagPanelContainer,
    sprintPickerHandle,
    expandAll,
    collapseAll,
  } = params;

  // Survives every repaint AND every refresh, which is the whole point: the elements a reader
  // collapsed are thrown away on each pass (a drag-reorder, a re-sort, a filter change, a re-read),
  // so the outline they were looking at only comes back if the state is remembered outside the DOM.
  // Same reason, opposite default, for the opened discussions: a notes panel fetches when it opens,
  // so the rows that were OPENED are what has to survive — recording the closed ones would make every
  // newly-rendered row start by loading a discussion nobody asked to see.
  const { collapsedIds, expandedNoteIds, selectedTags } = params.session;

  const renderTreeContent = (): void => {
    const filterOn = sprintPickerHandle.isFilterActive();
    const expandableRows: ExpandableRow[] = [];
    const properties = params.context.properties;
    const orderingPolicy = params.currentOrderingPolicy();
    // Every element from the previous pass is about to be discarded, so the controller's row map is
    // cleared before the new rows register themselves against it.
    params.dragReorder?.reset();
    const options: TreeRenderOptions = {
      doc,
      context: params.context,
      typeMap: params.typeMap,
      queue: params.fieldWrites,
      statusWidthCh: params.metrics.statusWidthCh,
      boardColumns: params.metrics.boardColumns,
      filter: {
        sprint: filterOn ? sprintPickerHandle.selectedSprint() : null,
        tags: selectedTags,
        // Rebuilt on every pass rather than once per board: "now" moves, so a board left open long
        // enough ages an item out the next time anything repaints it.
        isResolvedPastWindow: createResolvedWindowFilter(
          params.typeMap,
          params.metrics.boardColumns,
          hideResolvedAfterDays(properties),
          params.context.services.now(),
        ),
      },
      orderingPolicy,
      // Sprint pills only earn their space when the sprint filter is not already narrowing the board.
      showSprintPills: !filterOn,
      chip: params.chipContext,
      expandableRows,
      collapsedIds,
      expandedNoteIds,
      // Rebuilt per pass for the same reason the resolved-age filter is: "the last N weeks" moves
      // with the clock, so a board left open must not keep fetching against the window it opened on.
      notesSinceIso: noteWindowStart(params.context.services.now(), updatesWindowWeeks(properties)),
      mentionNames: params.context.services.mentionDirectory.knownNames(),
      minorChildColor: params.metrics.minorChildColor,
      // Manual drag order only means anything while the board is showing the manual rank; under any
      // other policy a dropped row would be re-sorted straight back out of the slot it landed in.
      dragReorder: orderingPolicy === MANUAL_ORDERING_POLICY ? params.dragReorder : null,
    };

    treeContainer.innerHTML = "";
    // The epic is already summarized in the header (title + TechLead), so the tree lists its
    // children downward rather than repeating the epic as the top row.
    treeContainer.append(...renderTree(root, options, 0));

    wireExpandCollapseButtons(expandAll, collapseAll, expandableRows, collapsedIds);
  };

  // Rebuild the tag filter panel from the tags currently worn across the tree. Dropping any selected
  // tag that no longer exists keeps the filter from getting stuck on a vanished tag. The panel hides
  // entirely when nobody in the tree is assigned (nothing to filter by).
  const refreshTagPanel = (): void => {
    const tags = collectAssignedTags([root]);
    for (const selected of [...selectedTags]) {
      if (!tags.includes(selected)) selectedTags.delete(selected);
    }
    tagPanelContainer.innerHTML = "";
    if (tags.length === 0) return;
    tagPanelContainer.append(
      renderTagFilterPanel(doc, {
        tags,
        selected: selectedTags,
        onChange: () => {
          refreshTagPanel();
          renderTreeContent();
        },
      }),
    );
  };

  return { renderTreeContent, refreshTagPanel };
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
  repaint: () => void;
}): void {
  const { root, move, queue, services, repaint } = params;
  const moved = findTrackedItem(root, move.id);
  if (moved === null) {
    // The board is showing a tree that no longer contains the dragged item; writing a rev from a
    // stale model would be worse than declining the move.
    services.logger.error(`Drag-reorder aborted: item ${move.id} is not in the rendered tree.`);
    return;
  }
  void queue
    .enqueueReorder({
      id: move.id,
      currentRev: () => moved.rev,
      parentId: move.parentId,
      currentParentId: move.currentParentId,
      previousId: move.previousId,
      nextId: move.nextId,
      siblingIds: move.siblingIds,
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
      if (applyMoveToTree(root, move, result.order ?? null)) {
        repaint();
      }
    });
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

/**
 * The two containers the board repaints into, appended in reading order.
 *
 * The tag filter panel stays empty until the Feature Crew roster resolves (a person's tag is only
 * known once it loads), so it is created up front rather than inserted later — appearing between the
 * header and the tree would otherwise shove the whole board down mid-read.
 */
function createBoardPanels(
  doc: Document,
  board: HTMLElement,
): { tagPanelContainer: HTMLElement; treeContainer: HTMLElement } {
  const tagPanelContainer = doc.createElement("div");
  tagPanelContainer.className = "awesomeado-tracking__tag-filter";
  const treeContainer = doc.createElement("div");
  treeContainer.className = "awesomeado-tracking__tree";
  board.append(tagPanelContainer, treeContainer);
  return { tagPanelContainer, treeContainer };
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
  repaint: () => void;
}): {
  controller: DragReorderController | null;
  dragReorderUnavailable: (policy: OrderingPolicy) => string | null;
} {
  const { root, services, queue, doc, repaint } = params;
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
            (move) => persistMove({ root, move, team, queue, services, repaint }),
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

function renderBoard(params: RenderBoardParams): BoardHandle {
  const { doc, root, context, typeMap, sprintWindow, session, folderPath } = params;
  const board = doc.createElement("div");
  // Trim the top padding to 2px so the header card sits close to the top of the view; the sides and
  // bottom keep the board's shared edge padding.
  board.style.cssText = `padding:2px ${BOARD_EDGE_PADDING_PX}px ${BOARD_EDGE_PADDING_PX}px`;

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

  const { header, sprintPickerHandle, expandAll, collapseAll, refresh, techLead } = renderHeader(
    doc,
    root,
    context,
    typeMap,
    sprintWindow,
    session,
    chipContext,
    { writeQueueStatus: writeStatus.element, orderingPicker: core.ordering.element },
    folderPath,
    core.writes,
  );
  refresh.element.onclick = () => params.onRefresh();
  board.append(header);

  const { tagPanelContainer, treeContainer } = createBoardPanels(doc, board);

  const { renderTreeContent, refreshTagPanel } = createBoardTreeRenderer({
    doc,
    root,
    context,
    typeMap,
    session,
    treeContainer,
    tagPanelContainer,
    sprintPickerHandle,
    chipContext,
    fieldWrites: core.writes,
    metrics: core.metrics,
    expandAll,
    collapseAll,
    currentOrderingPolicy: core.ordering.policy,
    dragReorder: core.dragReorder,
  });

  renderTreeContent();
  core.setRepaint(renderTreeContent);
  wireSprintPickerRerender(sprintPickerHandle, session, renderTreeContent);

  return {
    element: board,
    applyCrewMembers: (members) => {
      applyFeatureCrewTags([root], members);
      // The header is not part of the tree re-render, so refresh the epic's TechLead in place.
      if (techLead) populateTechLead(techLead, root, chipContext);
      refreshTagPanel();
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
function renderValidationError(root: HTMLElement, doc: Document, message: string): void {
  root.innerHTML = "";
  root.append(renderViewScaffold(doc, { title: "Project Tracking", message }));
}

/**
 * Validates root count and type. Returns the valid root or null if validation failed (error already rendered).
 */
function validateRoot(
  result: WorkItemTreeResult,
  root: HTMLElement,
  doc: Document,
  firstType: string | undefined,
): TrackedWorkItem | null {
  const rootCount = result.roots.length;

  if (rootCount === 0) {
    renderValidationError(root, doc, "This query returned no items.");
    return null;
  }

  if (rootCount > 1) {
    renderValidationError(root, doc, "This query must have exactly one root item.");
    return null;
  }

  const treeRoot = result.roots[0];
  if (!treeRoot) {
    renderValidationError(root, doc, "This query returned no items.");
    return null;
  }

  if (firstType && treeRoot.type !== firstType) {
    renderValidationError(root, doc, `The root item must be a ${firstType}.`);
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
): TrackedWorkItem | null {
  const types = services.getTypes();
  const firstType = types[0]?.name;

  // Validation: log the conclusion exactly once.
  const isTreeQuery = result.isTreeQuery;
  const rootCount = result.roots.length;
  const rootType = result.roots[0]?.type;
  services.logger.info(
    `Project Tracking validation: isTreeQuery=${isTreeQuery}, rootCount=${rootCount}, rootType=${rootType ?? "N/A"}, expectedType=${firstType ?? "N/A"}`,
  );

  if (result.error) {
    renderValidationError(root, doc, result.error);
    return null;
  }

  if (!isTreeQuery) {
    renderValidationError(root, doc, "Project Tracking requires a tree (work item links) query.");
    return null;
  }

  return validateRoot(result, root, doc, firstType);
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

  const treeRoot = validateAndRenderErrors(result, root, context.doc, services);
  if (treeRoot === null) {
    return null;
  }

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
  const session = createBoardSession();
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
  render: (context) => {
    const root = context.doc.createElement("section");
    root.className = "awesomeado-view awesomeado-tracking";
    // Trim the top padding to 2px so the (sticky) header card sits close to the top ADO bar; the
    // sides and bottom use the board's shared edge padding. The board below adds its own matching
    // top padding.
    root.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "min-height:100%",
      "box-sizing:border-box",
      "font-family:inherit",
      "color:var(--text-primary-color, inherit)",
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
      "color:var(--text-secondary-color, #8a8886)",
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
