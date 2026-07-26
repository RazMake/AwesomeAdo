import {
  applyFeatureCrewTags,
  collectAssignedTags,
  collectFeatureCrewAssignees,
  deriveAlias,
  type FeatureCrewAssignee,
  type FeatureCrewMember,
  type FeatureCrewTagAssignment,
} from "../../../common/ado/FeatureCrew";
import { FieldWriteQueue } from "../../../common/ado/FieldWriteQueue/FieldWriteQueue";
import type { DirectoryUser } from "../../../common/ado/IUserDirectory";
import type { QueryFolderCrumb, WorkItemTreeResult } from "../../../common/ado/IWorkItemTreeLoader";
import type {
  TrackedUser,
  TrackedWorkItem,
  TypeCatalogEntry,
} from "../../../common/ado/TrackedWorkItem";
import { buildQueryFolderUrl, buildWorkItemUrl } from "../../../common/ado/fetchAdoTree";
import type { SprintWindow } from "../../../common/ado/sprintWindow";
import type {
  DataDrivenViewContext,
  EnhancedView,
  EnhancedViewContext,
  EnhancedViewServices,
} from "../../../common/view-common/EnhancedView";
import { renderAssignedTo } from "../../../common/view-common/control/AssignedTo/AssignedTo";
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
  renderSprintPicker,
  type SprintPickerHandle,
} from "../../../common/view-common/control/SprintPicker/SprintPicker";
import { renderStatusBadge } from "../../../common/view-common/control/StatusBadge/StatusBadge";
import { renderViewScaffold } from "../../../common/view-common/control/ViewScaffold/ViewScaffold";
import { renderWriteQueueStatus } from "../../../common/view-common/control/WriteQueueStatus/WriteQueueStatus";

import { renderProjectTrackingHeader } from "./header/ProjectTrackingHeader";
import { projectTrackingViewType } from "./projectTrackingViewType";
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
 * Predicate: is this item (or any of its descendants) visible under the active sprint and tag
 * filters? An item self-matches when it passes BOTH filters (an empty selection passes that filter);
 * multiple selected tags form an OR. An ancestor stays visible when any descendant self-matches, so
 * a matching item is never orphaned from its path.
 */
function isVisibleUnderFilter(
  item: TrackedWorkItem,
  filterSprint: string | null,
  selectedTags: Set<string | null>,
): boolean {
  const matchesSprint = !filterSprint || item.sprintName === filterSprint;
  const key = itemTagKey(item);
  const matchesTag = selectedTags.size === 0 || (key !== undefined && selectedTags.has(key));
  if (matchesSprint && matchesTag) return true;
  return item.children.some((child) => isVisibleUnderFilter(child, filterSprint, selectedTags));
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

  const descText = doc.createElement("div");
  descText.className = "awesomeado-tracking__desc-text";
  descText.textContent = item.description;
  // Themed primary text color for description text.
  descText.style.cssText = [
    "font-size:11px",
    "color:var(--text-primary-color, #323130)",
    "white-space:pre-wrap",
  ].join(";");
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
 * Everything the tree renderer holds constant for one pass over the tree, bundled so the recursive
 * render functions take a depth and an item rather than a dozen positional arguments that every
 * intermediate function would otherwise have to forward verbatim.
 */
interface TreeRenderOptions {
  doc: Document;
  context: DataDrivenViewContext;
  typeMap: Map<string, TypeCatalogEntry>;
  /** The board's single serialized field-write queue, shared by status and ETA edits. */
  queue: FieldWriteQueue;
  /** The shared status-badge width so every badge on the board renders one uniform size. */
  statusWidthCh: number;
  /** The team's global board columns in order; a status colors by its position in this list. */
  boardColumns: string[];
  /** The sprint the board is filtered to, or null when the sprint filter is off. */
  filterSprint: string | null;
  /** The active Feature Crew tag filter (empty = everyone); `null` is the untagged "??" bucket. */
  selectedTags: Set<string | null>;
  showSprintPills: boolean;
  onAssigneeChange: (user: DirectoryUser) => void;
  tagEditor: AssigneeTagEditor | null;
  /** Collects every twisty rendered in this pass so expand-all/collapse-all can drive them. */
  allTwisties: HTMLButtonElement[];
  /** The color the rolled-up child badge tints from; null leaves it a neutral chip. */
  minorChildColor: string | null;
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
    twistyGlyph.className = "awesomeado-tracking__twisty-glyph";
    twistyGlyph.textContent = "\u25BC\uFE0E";
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
): { titleSpan: HTMLElement; descButton: HTMLButtonElement; descPanel: HTMLElement } {
  const titleSpan = doc.createElement("span");
  titleSpan.className = "awesomeado-tracking__item-title";
  titleSpan.textContent = item.title;
  // Break long, unspaced tokens so an over-long title wraps instead of forcing a horizontal scroll.
  titleSpan.style.cssText = "font-weight:500;overflow-wrap:anywhere";
  const itemColor = typeColorOf(item.type, typeMap);
  if (itemColor) {
    titleSpan.style.color = itemColor;
  }

  const { panel: descPanel, toggleButton: descButton } = renderDescription(doc, item);
  // The ? disc flows inline immediately after the title text (with the assignee right behind it), so
  // it always hugs the end of the title — even when the title wraps — instead of sitting at the far
  // right edge of a stretched flex box. vertical-align:middle keeps it centered on the text line.
  descButton.style.display = "inline-flex";
  descButton.style.verticalAlign = "middle";
  descButton.style.margin = "0 4px";

  return { titleSpan, descButton, descPanel };
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
  queue: FieldWriteQueue,
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
 * Describes one rolled-up child for the badge's popup: its assignee, type-colored title, its own
 * editable ETA badge, and the type icon that deep-links the item in ADO. The ETA badge is built with
 * the SAME helper the tree rows use, so a rolled-up child's ETA is edited and persisted exactly like
 * a row's rather than being a read-only echo.
 */
function describeMinorChild(
  child: TrackedWorkItem,
  options: TreeRenderOptions,
): ChildItemDescriptor {
  const { doc, typeMap, queue, context, onAssigneeChange } = options;
  const icon = typeMap.get(child.type)?.icon ?? "";
  return {
    assignedTo: child.assignedTo,
    title: child.title,
    titleColor: typeColorOf(child.type, typeMap),
    eta: createItemEtaBadge(doc, child, typeMap, queue, context.services.now()),
    iconUrl: icon.length > 0 ? icon : null,
    // The view runs on the ADO query page, so the page's own URL supplies the org/project the item
    // link resolves against; an unrecognizable location leaves the affordance inert.
    url: buildWorkItemUrl(doc.location?.href ?? "", child.id),
    onAssigneeChange,
  };
}

/**
 * Rolls a row's children up into a single "completed / total" badge, or null when there is nothing
 * to summarize. Only children that survive the active sprint and tag filters are counted or listed,
 * so the rollup always agrees with what those filters claim the board is showing.
 */
function createMinorChildrenBadge(
  item: TrackedWorkItem,
  options: TreeRenderOptions,
): HTMLElement | null {
  const { context, typeMap, boardColumns, filterSprint, selectedTags } = options;

  const visible = item.children.filter((child) =>
    isVisibleUnderFilter(child, filterSprint, selectedTags),
  );
  if (visible.length === 0) return null;

  const completedOrdinal = boardColumns.length - COMPLETED_COLUMN_FROM_END;
  const completedCount = visible.filter(
    (child) =>
      boardColumnOrdinal(statusLabelOf(child, typeMap.get(child.type)), boardColumns) ===
      completedOrdinal,
  ).length;

  const badge = renderChildItemsBadge(options.doc, {
    children: visible.map((child) => describeMinorChild(child, options)),
    completedCount,
    userDirectory: context.services.userDirectory,
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
function createRowAssignee(
  item: TrackedWorkItem,
  services: EnhancedViewServices,
  options: TreeRenderOptions,
): HTMLElement {
  const { doc, onAssigneeChange, tagEditor } = options;
  const assignee = item.assignedTo;
  const assignedEl = renderAssignedTo(doc, {
    user: item.assignedTo,
    userDirectory: services.userDirectory,
    onChange: onAssigneeChange,
    showTag: true,
    assignableTags: tagEditor ? tagEditor.tagsInUse() : undefined,
    onTagChange: tagEditor && assignee ? (tag) => tagEditor.assign(assignee, tag) : undefined,
  });
  // Flows inline right behind the ? disc so it hugs the title; middle-aligned to the text line.
  assignedEl.style.verticalAlign = "middle";
  assignedEl.style.whiteSpace = "nowrap";
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

  inline.push(createRowAssignee(item, context.services, options));

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
): { row: HTMLElement; childrenContainer: HTMLElement; twisty: HTMLButtonElement | null } {
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

  const { titleSpan, descButton, descPanel } = createTitleControls(doc, item, typeMap);
  const { inline, eta } = createRowRightControls(item, options, showsChildRows);

  // Status badge, title, ? disc and assignee share ONE inline-flow block so they read as a single
  // line. Because they flow as inline content (not rigid flex items) they pack tightly and wrap
  // together, so the ? and assignee always hug the end of the wrapped title instead of drifting to a
  // stretched box's right edge. The block grows and shrinks (flex:1 1 auto) and wraps the title
  // INTERNALLY; the row itself never wraps, so the ETA stays to the right. The status badge is the
  // first inline child (vertical-align:middle) so it sits at the center of the first line. A <span>
  // (not a <div>) keeps it out of the row's div-ancestor chain; as a flex item it is still
  // blockified, so its inline children wrap within it.
  const contentBlock = doc.createElement("span");
  contentBlock.className = "awesomeado-tracking__content";
  contentBlock.style.cssText = "flex:1 1 auto;min-width:0;line-height:1.8";
  contentBlock.append(stateBadge, titleSpan, descButton, ...inline);
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
  rowWrapper.append(row, descPanel, childrenContainer);

  // Wire twisty toggle.
  if (twisty) {
    const twistyGlyph = twisty.querySelector<HTMLElement>(".awesomeado-tracking__twisty-glyph");
    twisty.addEventListener("click", () => {
      const isExpanded = twisty.getAttribute("aria-expanded") === "true";
      twisty.setAttribute("aria-expanded", isExpanded ? "false" : "true");
      // Update the inner glyph (not the button's textContent) so the centering box stays intact.
      if (twistyGlyph) {
        twistyGlyph.textContent = isExpanded ? "\u25B6\uFE0E" : "\u25BC\uFE0E";
      }
      childrenContainer.style.display = isExpanded ? "none" : "block";
    });
  }

  return { row: rowWrapper, childrenContainer, twisty };
}

/**
 * Recursively renders the tree of work items, respecting the sprint and tag filters.
 * Returns an array of row wrappers (each contains row + description + children container).
 *
 * Recursion stops at `MAX_ROW_DEPTH`: deeper items are summarized by the deepest row's rollup badge
 * (see `createMinorChildrenBadge`) instead of extending the outline.
 */
function renderTree(
  items: TrackedWorkItem[],
  options: TreeRenderOptions,
  depth: number,
): HTMLElement[] {
  return items
    .filter((item) => isVisibleUnderFilter(item, options.filterSprint, options.selectedTags))
    .map((item) => {
      const { row, childrenContainer, twisty } = renderRow(item, options, depth);
      if (twisty) options.allTwisties.push(twisty);

      if (depth < MAX_ROW_DEPTH) {
        childrenContainer.append(...renderTree(item.children, options, depth + 1));
      }

      return row;
    });
}

/**
 * Renders the sprint picker control using the reusable SprintPicker component, fed the shared sprint
 * window (the iterations around the current one, each already labelled by its offset). The filter
 * defaults ON and pre-selects the current sprint, so the board opens focused on the current sprint.
 */
function renderSprintControls(doc: Document, sprintWindow: SprintWindow): SprintPickerHandle {
  const handle = renderSprintPicker(doc, {
    sprints: sprintWindow.entries,
    selectedName: sprintWindow.currentName,
    filterActive: sprintWindow.entries.length > 0,
  });
  return handle;
}

/**
 * Fills (or refills) the tech lead group with its label and the epic assignee's picker. Split out so
 * the group can be rebuilt in place from the header, which is not part of the tree re-render.
 */
function populateTechLead(
  doc: Document,
  group: HTMLElement,
  root: TrackedWorkItem,
  context: DataDrivenViewContext,
  onAssigneeChange: (user: DirectoryUser) => void,
): void {
  group.innerHTML = "";

  const label = doc.createElement("span");
  label.textContent = "TechLead:";
  label.style.cssText = "font-weight:500";
  group.append(label);

  const assignedEl = renderAssignedTo(doc, {
    user: root.assignedTo,
    userDirectory: context.services.userDirectory,
    onChange: onAssigneeChange,
    // The Tech Lead is a single named owner, not a Feature Crew member, so its chip never shows a tag.
    showTag: false,
  });
  // Nudge the chip 1px down so it reads as optically centered against the "TechLead:" label.
  assignedEl.style.position = "relative";
  assignedEl.style.top = "1px";
  group.append(assignedEl);
}

/**
 * Creates the tech lead group (label + assigned-to control).
 */
function createTechLeadGroup(
  doc: Document,
  root: TrackedWorkItem,
  context: DataDrivenViewContext,
  onAssigneeChange: (user: DirectoryUser) => void,
): HTMLElement | null {
  const techLeadGroup = doc.createElement("div");
  techLeadGroup.className = "awesomeado-tracking__techlead";
  techLeadGroup.style.cssText = ["display:flex", "align-items:center", "gap:8px"].join(";");

  populateTechLead(doc, techLeadGroup, root, context, onAssigneeChange);

  return techLeadGroup;
}

/**
 * Renders the header tile by delegating layout to the view's own header control, feeding it the
 * pieces the control does not build itself (the Tech Lead picker, the sprint picker, and the
 * write-queue status indicator) plus the root's title, type color, and ETA.
 */
function renderHeader(
  doc: Document,
  root: TrackedWorkItem,
  context: DataDrivenViewContext,
  typeMap: Map<string, TypeCatalogEntry>,
  sprintWindow: SprintWindow,
  onAssigneeChange: (user: DirectoryUser) => void,
  writeQueueStatus: HTMLElement,
  folderPath: QueryFolderCrumb[],
  queue: FieldWriteQueue,
): {
  header: HTMLElement;
  sprintPickerHandle: SprintPickerHandle;
  expandAll: HTMLButtonElement;
  collapseAll: HTMLButtonElement;
  techLead: HTMLElement | null;
} {
  const sprintPickerHandle = renderSprintControls(doc, sprintWindow);
  const techLead = createTechLeadGroup(doc, root, context, onAssigneeChange);

  // The view runs on the ADO query page, so the page's own URL supplies the org/project the folder
  // links resolve against; when it is not a recognizable ADO location the segment stays plain text
  // rather than pointing at a fabricated URL.
  const pageHref = doc.location?.href ?? "";

  const {
    element: header,
    expandAllButton: expandAll,
    collapseAllButton: collapseAll,
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
    writeQueueStatus,
  });

  return { header, sprintPickerHandle, expandAll, collapseAll, techLead };
}

/**
 * Wires the expand/collapse-all button handlers.
 */
function wireExpandCollapseButtons(
  expandAll: HTMLButtonElement,
  collapseAll: HTMLButtonElement,
  allTwisties: HTMLButtonElement[],
): void {
  expandAll.onclick = () => {
    allTwisties.forEach((tw) => {
      tw.setAttribute("aria-expanded", "true");
      tw.textContent = "\u25BC\uFE0E";
      const rowWrapper = tw.closest(".awesomeado-tracking__row")?.parentElement;
      const childrenContainer = rowWrapper?.querySelector(".awesomeado-tracking__children");
      if (childrenContainer instanceof HTMLElement) {
        childrenContainer.style.display = "block";
      }
    });
  };

  collapseAll.onclick = () => {
    allTwisties.forEach((tw) => {
      tw.setAttribute("aria-expanded", "false");
      tw.textContent = "\u25B6\uFE0E";
      const rowWrapper = tw.closest(".awesomeado-tracking__row")?.parentElement;
      const childrenContainer = rowWrapper?.querySelector(".awesomeado-tracking__children");
      if (childrenContainer instanceof HTMLElement) {
        childrenContainer.style.display = "none";
      }
    });
  };
}

/**
 * A rendered board plus the hook the view uses to feed it the Feature Crew roster once it resolves.
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
}

/**
 * A "Saving…" indicator driven by BOTH in-flight field writes (status column, ETA) AND
 * user-triggered roster reconciles (tag picks / inline assignee changes). Each source reports its own
 * pending count; the displayed total is their sum, so the indicator shows for either kind of save.
 *
 * It also subscribes to the queue's FAILED count, because every editable control on this board is
 * persist-then-reflect: a rejected write leaves the screen unchanged, so without this the user
 * cannot tell a lost edit from a slow one.
 *
 * No explicit unsubscribe is needed — the control and the queue share the board's lifetime (one
 * render per tab), so their lifetimes match.
 */
function createBoardWriteStatus(
  doc: Document,
  fieldWrites: FieldWriteQueue,
): { element: HTMLElement; setReconcilePending: (count: number) => void } {
  const writeStatus = renderWriteQueueStatus(doc);
  let statePending = 0;
  let reconcilePending = 0;
  const refresh = (): void => writeStatus.setCount(statePending + reconcilePending);
  fieldWrites.onPendingChange((count) => {
    statePending = count;
    refresh();
  });
  fieldWrites.onWriteFailed((count) => {
    writeStatus.setFailedCount(count);
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
 * Wire the sprint picker so toggling the funnel or changing the sprint re-renders the tree. The
 * click is deferred a tick because the picker toggles its OWN internal state on the same click; the
 * re-render must read the state after that flip, not before.
 */
function wireSprintPickerRerender(
  sprintPickerHandle: SprintPickerHandle,
  renderTreeContent: () => void,
): void {
  const pickerElement = sprintPickerHandle.element;
  const button = pickerElement.querySelector(
    ".awesomeado-sprint-picker__button",
  ) as HTMLButtonElement;
  const select = pickerElement.querySelector(
    ".awesomeado-sprint-picker__select",
  ) as HTMLSelectElement;

  if (button) {
    button.addEventListener("click", () => {
      setTimeout(() => renderTreeContent(), 0);
    });
  }

  if (select) {
    select.addEventListener("change", () => {
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
  selectedTags: Set<string | null>;
  treeContainer: HTMLElement;
  tagPanelContainer: HTMLElement;
  sprintPickerHandle: SprintPickerHandle;
  onAssigneeChange: (user: DirectoryUser) => void;
  tagEditor: AssigneeTagEditor | null;
  fieldWrites: FieldWriteQueue;
  statusWidthCh: number;
  boardColumns: string[];
  minorChildColor: string | null;
  expandAll: HTMLButtonElement;
  collapseAll: HTMLButtonElement;
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
    selectedTags,
    treeContainer,
    tagPanelContainer,
    sprintPickerHandle,
    expandAll,
    collapseAll,
  } = params;

  const renderTreeContent = (): void => {
    const filterOn = sprintPickerHandle.isFilterActive();
    const allTwisties: HTMLButtonElement[] = [];
    const options: TreeRenderOptions = {
      doc,
      context: params.context,
      typeMap: params.typeMap,
      queue: params.fieldWrites,
      statusWidthCh: params.statusWidthCh,
      boardColumns: params.boardColumns,
      filterSprint: filterOn ? sprintPickerHandle.selectedSprint() : null,
      selectedTags,
      // Sprint pills only earn their space when the sprint filter is not already narrowing the board.
      showSprintPills: !filterOn,
      onAssigneeChange: params.onAssigneeChange,
      tagEditor: params.tagEditor,
      allTwisties,
      minorChildColor: params.minorChildColor,
    };

    treeContainer.innerHTML = "";
    // The epic is already summarized in the header (title + TechLead), so the tree lists its
    // children downward rather than repeating the epic as the top row.
    treeContainer.append(...renderTree(root.children, options, 0));

    wireExpandCollapseButtons(expandAll, collapseAll, allTwisties);
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
 * Renders the complete board: header + tree, wired with expand/collapse and sprint-picker filter controls.
 */
function renderBoard(
  doc: Document,
  root: TrackedWorkItem,
  context: DataDrivenViewContext,
  typeMap: Map<string, TypeCatalogEntry>,
  sprintWindow: SprintWindow,
  onAssigneeChange: (user: DirectoryUser) => void,
  onTagAssign: ((user: TrackedUser, tag: string) => void) | null,
  folderPath: QueryFolderCrumb[],
): BoardHandle {
  const board = doc.createElement("div");
  // Trim the top padding to 2px so the header card sits close to the top of the view; keep the
  // other sides at 16px for breathing room.
  board.style.cssText = "padding:2px 16px 16px 16px";

  // One serialized write queue per board (per tab): field edits never race on System.Rev.
  const services = context.services;
  const fieldWrites = new FieldWriteQueue(services.writeField, services.logger);
  const writeStatus = createBoardWriteStatus(doc, fieldWrites);

  // One shared badge width for the whole board so every status badge renders the same size.
  const statusWidthCh = widestStatusLabelLength(root, typeMap);
  // The global board-column order, so a status colors by its position (identical across every type).
  const boardColumns = services.getBoardColumns();
  // Rolled-up children always sit at the bottom of the configured hierarchy, so the rollup badge
  // wears a discrete tint of the LAST configured type's color — it reads as "these are the Tasks"
  // without having to name the type on a badge that only has room for a count.
  const minorChildColor = lastTypeColor(services.getTypes());
  const tagEditor = createTagEditor(root, onTagAssign);

  const { header, sprintPickerHandle, expandAll, collapseAll, techLead } = renderHeader(
    doc,
    root,
    context,
    typeMap,
    sprintWindow,
    onAssigneeChange,
    writeStatus.element,
    folderPath,
    fieldWrites,
  );
  board.append(header);

  // The active tag filter (OR across the selected tags; empty = show everyone). `null` is the "??"
  // bucket for assigned-but-untagged people. Owned here as the single source of truth so the panel
  // pills and the tree filter never drift.
  const selectedTags = new Set<string | null>();
  // The tag filter panel sits above the tree; it stays empty until the Feature Crew roster resolves,
  // since a person's tag is only known once the roster loads.
  const tagPanelContainer = doc.createElement("div");
  tagPanelContainer.className = "awesomeado-tracking__tag-filter";
  board.append(tagPanelContainer);

  const treeContainer = doc.createElement("div");
  treeContainer.className = "awesomeado-tracking__tree";
  board.append(treeContainer);

  const { renderTreeContent, refreshTagPanel } = createBoardTreeRenderer({
    doc,
    root,
    context,
    typeMap,
    selectedTags,
    treeContainer,
    tagPanelContainer,
    sprintPickerHandle,
    onAssigneeChange,
    tagEditor,
    fieldWrites,
    statusWidthCh,
    boardColumns,
    minorChildColor,
    expandAll,
    collapseAll,
  });

  renderTreeContent();
  wireSprintPickerRerender(sprintPickerHandle, renderTreeContent);

  return {
    element: board,
    applyCrewMembers: (members) => {
      applyFeatureCrewTags([root], members);
      // The header is not part of the tree re-render, so refresh the epic's TechLead in place.
      if (techLead) populateTechLead(doc, techLead, root, context, onAssigneeChange);
      refreshTagPanel();
      renderTreeContent();
    },
    setReconcilePending: writeStatus.setReconcilePending,
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
      const added = add({
        alias: deriveAlias(user.uniqueName, user.displayName),
        fullName: user.displayName,
      });
      if (added) {
        reconcile(undefined, true);
      }
    },
    setTag(user, tag) {
      // The person is already assigned somewhere, so they are on the roster; record their chosen tag
      // and reconcile. The resolved roster then repaints every pill and refreshes the tag filter.
      const alias = deriveAlias(user.uniqueName, user.displayName);
      reconcile([{ alias, tag }], true);
    },
  };
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
function renderLoadedBoard(
  context: DataDrivenViewContext,
  root: HTMLElement,
  services: EnhancedViewServices,
  result: WorkItemTreeResult,
  sprintWindow: SprintWindow,
): void {
  // Remove title and loading, render error or board.
  root.innerHTML = "";

  const treeRoot = validateAndRenderErrors(result, root, context.doc, services);
  if (treeRoot === null) {
    return;
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

  const board = renderBoard(
    context.doc,
    treeRoot,
    context,
    typeMap,
    sprintWindow,
    onAssigneeChange,
    onTagAssign,
    result.folderPath ?? [],
  );
  applyCrewMembers = board.applyCrewMembers;
  reportReconcilePending = board.setReconcilePending;
  root.append(board.element);

  // Reconcile once now the whole tree is known (create-if-missing, append any new assignees); its
  // resolved roster then paints the assignee tags and fills the tag filter panel.
  crewSync?.seed([treeRoot]);
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
 * The Project Tracking view renderer: a live tree board with sprint filtering, expand/collapse, and description toggles.
 */
export const projectTrackingView: EnhancedView = {
  id: projectTrackingViewType.id,
  render: (context) => {
    const root = context.doc.createElement("section");
    root.className = "awesomeado-view awesomeado-tracking";
    // Trim the top padding to 2px so the (sticky) header card sits close to the top ADO bar; keep
    // the other sides at 16px for breathing room. The board below adds its own matching top padding.
    root.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "min-height:100%",
      "box-sizing:border-box",
      "font-family:inherit",
      "color:var(--text-primary-color, inherit)",
      "text-align:left",
      "padding:2px 16px 16px 16px",
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

    // The tree and the sprint window are independent reads, so fire both together and render once
    // both resolve; the picker opens populated. A sprint-window failure resolves to an empty window
    // (the filter is simply left disabled) and never blocks the board.
    Promise.all([services.loadTree(context.queryId), services.loadSprintWindow()])
      .then(([result, sprintWindow]) =>
        renderLoadedBoard(dataContext, root, services, result, sprintWindow),
      )
      .catch((err: unknown) => renderTreeLoadFailure(dataContext, root, services, err));

    return root;
  },
};
