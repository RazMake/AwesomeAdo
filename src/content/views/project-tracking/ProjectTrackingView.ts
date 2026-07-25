import {
  collectFeatureCrewAssignees,
  deriveAlias,
  type FeatureCrewAssignee,
} from "../../../common/ado/FeatureCrew";
import type { DirectoryUser } from "../../../common/ado/IUserDirectory";
import type { WorkItemTreeResult } from "../../../common/ado/IWorkItemTreeLoader";
import { StateWriteQueue } from "../../../common/ado/StateWriteQueue/StateWriteQueue";
import type {
  SprintRef,
  TrackedWorkItem,
  TypeCatalogEntry,
} from "../../../common/ado/TrackedWorkItem";
import type {
  EnhancedView,
  EnhancedViewContext,
  EnhancedViewServices,
} from "../../../common/view-common/EnhancedView";
import { renderAssignedTo } from "../../../common/view-common/control/AssignedTo/AssignedTo";
import { renderDateLabel } from "../../../common/view-common/control/DateLabel/DateLabel";
import { renderEtaBadge } from "../../../common/view-common/control/EtaBadge/EtaBadge";
import {
  renderSprintPicker,
  type SprintPickerHandle,
} from "../../../common/view-common/control/SprintPicker/SprintPicker";
import { renderStatusBadge } from "../../../common/view-common/control/StatusBadge/StatusBadge";
import { renderViewScaffold } from "../../../common/view-common/control/ViewScaffold/ViewScaffold";
import { detectAdoQueryFolderPath } from "../../ado-probe/AdoQueryFolderProbe";

import { renderProjectTrackingHeader } from "./header/ProjectTrackingHeader";
import { projectTrackingViewType } from "./projectTrackingViewType";

/**
 * Returns the hex color for a given work item type name, or null when not found.
 * The color in TypeCatalogEntry is stored WITHOUT the '#' prefix.
 */
function typeColorOf(typeName: string, typeMap: Map<string, TypeCatalogEntry>): string | null {
  const entry = typeMap.get(typeName);
  return entry ? `#${entry.color}` : null;
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
 * Predicate: is this item (or any of its descendants) visible under the given sprint filter?
 * When filterSprint is null, all items are visible (filter OFF).
 */
function isVisibleUnderFilter(item: TrackedWorkItem, filterSprint: string | null): boolean {
  if (!filterSprint) return true; // Filter OFF → show all.
  // Show if item matches sprint, or if any child is visible (preserves ancestor path).
  if (item.sprintName === filterSprint) return true;
  return item.children.some((child) => isVisibleUnderFilter(child, filterSprint));
}

/**
 * Derives sprint options from the loaded tree while team-iteration metadata is unavailable.
 */
export function collectSprintsFromTree(root: TrackedWorkItem): SprintRef[] {
  const sprints: SprintRef[] = [];
  const seen = new Set<string>();
  const pending = [root];

  while (pending.length > 0) {
    const item = pending.shift()!;
    if (item.sprintName) {
      const key = item.iterationPath ?? item.sprintName;
      if (!seen.has(key)) {
        seen.add(key);
        sprints.push({ path: item.iterationPath ?? item.sprintName, name: item.sprintName });
      }
    }
    pending.unshift(...item.children);
  }

  return sprints;
}

/**
 * Builds the meta line for the description panel: "Created: <date> (by <name>), Last Modified: <date> (by <name>)".
 * Uses textContent for names and appends DateLabel elements, never innerHTML.
 */
function buildMetaLine(
  doc: Document,
  item: TrackedWorkItem,
): { container: HTMLElement; dateElements: number } {
  const meta = doc.createElement("div");
  meta.className = "awesomeado-tracking__meta";
  // Muted text color from ADO theme so the meta line reads on both light and dark themes.
  meta.style.cssText = [
    "font-size:10px",
    "color:var(--text-secondary-color, #8a8886)",
    "margin-bottom:8px",
  ].join(";");

  meta.append(doc.createTextNode("Created: "));
  meta.append(renderDateLabel(doc, item.createdDate));
  meta.append(doc.createTextNode(` (by ${item.createdBy?.displayName ?? "Unknown"}), `));
  meta.append(doc.createTextNode("Last Modified: "));
  meta.append(renderDateLabel(doc, item.changedDate));
  meta.append(doc.createTextNode(` (by ${item.changedBy?.displayName ?? "Unknown"})`));

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
  panel.style.cssText = "display:none;margin-top:8px;padding-left:24px";

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
 * Creates the row controls (twisty or spacer, status badge with editable state).
 */
function createRowControls(
  doc: Document,
  item: TrackedWorkItem,
  typeMap: Map<string, TypeCatalogEntry>,
  queue: StateWriteQueue,
  statusWidthCh: number,
  boardColumns: string[],
): { controls: HTMLElement[]; twisty: HTMLButtonElement | null } {
  const controls: HTMLElement[] = [];
  let twisty: HTMLButtonElement | null = null;

  if (item.children.length > 0) {
    twisty = doc.createElement("button");
    twisty.className = "awesomeado-tracking__twisty";
    twisty.type = "button";
    twisty.textContent = "\u25BC\uFE0E";
    twisty.setAttribute("aria-expanded", "true");
    // Bare twisty: only the triangle glyph is visible — no border, no background — so the tree reads
    // as a clean outline. Keep the fixed width so it lines up with the leaf-row spacer.
    twisty.style.cssText = [
      "cursor:pointer",
      "border:none",
      "background:none",
      "font-size:8px",
      "padding:0",
      "width:20px",
      "line-height:1",
      "color:var(--text-primary-color, #323130)",
    ].join(";");
    controls.push(twisty);
  } else {
    const spacer = doc.createElement("span");
    spacer.style.cssText = "width:20px";
    controls.push(spacer);
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
      // Optimistically reflect the new Status, then enqueue a serialized write of its primary ADO
      // State. The queue logs failures and never rejects, so reconcile on its resolved result.
      queue.enqueue({ id: item.id, rev: item.rev, state: primaryState }).then((result) => {
        if (result.ok && result.rev !== undefined) {
          item.state = primaryState;
          item.rev = result.rev;
          // Update the badge text to reflect the new Status (the chosen column label).
          const badgeText = stateBadge.querySelector(".awesomeado-status__badge");
          if (badgeText) {
            badgeText.childNodes[0]!.textContent = column;
          }
        }
      });
    },
  });
  controls.push(stateBadge);

  return { controls, twisty };
}

/**
 * Creates the row title and description controls.
 */
function createTitleControls(
  doc: Document,
  item: TrackedWorkItem,
  typeMap: Map<string, TypeCatalogEntry>,
): { title: HTMLElement; descButton: HTMLButtonElement; descPanel: HTMLElement } {
  const titleSpan = doc.createElement("span");
  titleSpan.className = "awesomeado-tracking__item-title";
  titleSpan.textContent = item.title;
  titleSpan.style.cssText = "font-weight:500";
  const itemColor = typeColorOf(item.type, typeMap);
  if (itemColor) {
    titleSpan.style.color = itemColor;
  }

  const { panel: descPanel, toggleButton: descButton } = renderDescription(doc, item);

  return { title: titleSpan, descButton, descPanel };
}

/**
 * Creates the row right-side controls (assigned-to, sprint pill, ETA).
 */
function createRowRightControls(
  doc: Document,
  item: TrackedWorkItem,
  context: EnhancedViewContext,
  showSprintPills: boolean,
  onAssigneeChange: (user: DirectoryUser) => void,
): HTMLElement[] {
  const rightControls: HTMLElement[] = [];

  if (context.services) {
    const assignedEl = renderAssignedTo(doc, {
      user: item.assignedTo,
      userDirectory: context.services.userDirectory,
      onChange: onAssigneeChange,
    });
    rightControls.push(assignedEl);
  }

  if (showSprintPills && item.sprintName) {
    const pill = doc.createElement("span");
    pill.className = "awesomeado-tracking__sprint-pill";
    pill.textContent = item.sprintName;
    // Themed sprint pill: subtle fill and discrete border so it reads on any theme.
    pill.style.cssText = [
      "border:1px solid var(--palette-neutral-20, #ddd)",
      "border-radius:3px",
      "padding:2px 6px",
      "font-size:9px",
      "background:var(--palette-neutral-4, rgba(128,128,128,0.08))",
      "color:var(--text-primary-color, #323130)",
      "white-space:nowrap",
    ].join(";");
    rightControls.push(pill);
  }

  if (context.services) {
    const etaBadge = renderEtaBadge(doc, { eta: item.eta, now: context.services.now() });
    etaBadge.style.marginLeft = "auto";
    rightControls.push(etaBadge);
  }

  return rightControls;
}

/**
 * Renders a single work item row with all its controls (twisty, state, title, assignee, sprint pill, ETA).
 * Returns the row element, the children container, and the twisty button (null when no children).
 */
function renderRow(
  doc: Document,
  item: TrackedWorkItem,
  context: EnhancedViewContext,
  typeMap: Map<string, TypeCatalogEntry>,
  showSprintPills: boolean,
  onAssigneeChange: (user: DirectoryUser) => void,
  queue: StateWriteQueue,
  depth: number,
  statusWidthCh: number,
  boardColumns: string[],
): { row: HTMLElement; childrenContainer: HTMLElement; twisty: HTMLButtonElement | null } {
  const row = doc.createElement("div");
  row.className = "awesomeado-tracking__row";
  row.style.cssText = ["display:flex", "align-items:center", "gap:8px", "padding:4px 0"].join(";");

  const { controls, twisty } = createRowControls(
    doc,
    item,
    typeMap,
    queue,
    statusWidthCh,
    boardColumns,
  );
  controls.forEach((c) => row.append(c));

  const { title, descButton, descPanel } = createTitleControls(doc, item, typeMap);
  row.append(title, descButton);

  const rightControls = createRowRightControls(
    doc,
    item,
    context,
    showSprintPills,
    onAssigneeChange,
  );
  rightControls.forEach((c) => row.append(c));

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
    twisty.addEventListener("click", () => {
      const isExpanded = twisty.getAttribute("aria-expanded") === "true";
      twisty.setAttribute("aria-expanded", isExpanded ? "false" : "true");
      twisty.textContent = isExpanded ? "\u25B6\uFE0E" : "\u25BC\uFE0E";
      childrenContainer.style.display = isExpanded ? "none" : "block";
    });
  }

  return { row: rowWrapper, childrenContainer, twisty };
}

/**
 * Recursively renders the tree of work items, respecting the sprint filter.
 * Returns an array of row wrappers (each contains row + description + children container).
 */
function renderTree(
  doc: Document,
  items: TrackedWorkItem[],
  context: EnhancedViewContext,
  typeMap: Map<string, TypeCatalogEntry>,
  filterSprint: string | null,
  showSprintPills: boolean,
  allTwisties: HTMLButtonElement[],
  onAssigneeChange: (user: DirectoryUser) => void,
  queue: StateWriteQueue,
  depth: number,
  statusWidthCh: number,
  boardColumns: string[],
): HTMLElement[] {
  return items
    .filter((item) => isVisibleUnderFilter(item, filterSprint))
    .map((item) => {
      const { row, childrenContainer, twisty } = renderRow(
        doc,
        item,
        context,
        typeMap,
        showSprintPills,
        onAssigneeChange,
        queue,
        depth,
        statusWidthCh,
        boardColumns,
      );
      if (twisty) allTwisties.push(twisty);

      const childRows = renderTree(
        doc,
        item.children,
        context,
        typeMap,
        filterSprint,
        showSprintPills,
        allTwisties,
        onAssigneeChange,
        queue,
        depth + 1,
        statusWidthCh,
        boardColumns,
      );
      childrenContainer.append(...childRows);

      return row;
    });
}

/**
 * Renders the sprint picker control using the reusable SprintPicker component.
 * Returns the picker handle and the mounted element.
 * Current-sprint detection is a follow-up when sprint metadata carries an is-current flag.
 */
function renderSprintControls(doc: Document, sprints: SprintRef[]): SprintPickerHandle {
  const sprintOptions = sprints.map((s) => ({ path: s.path, name: s.name }));
  // Default filter active when sprints exist; selectedName undefined => picker defaults to first.
  const handle = renderSprintPicker(doc, {
    sprints: sprintOptions,
    selectedName: undefined,
    filterActive: sprints.length > 0,
  });
  return handle;
}

/**
 * Creates the tech lead group (label + assigned-to control).
 */
function createTechLeadGroup(
  doc: Document,
  root: TrackedWorkItem,
  context: EnhancedViewContext,
  onAssigneeChange: (user: DirectoryUser) => void,
): HTMLElement | null {
  if (!context.services) return null;

  const techLeadGroup = doc.createElement("div");
  techLeadGroup.className = "awesomeado-tracking__techlead";
  techLeadGroup.style.cssText = ["display:flex", "align-items:center", "gap:8px"].join(";");

  const label = doc.createElement("span");
  label.textContent = "TechLead:";
  label.style.cssText = "font-weight:500";
  techLeadGroup.append(label);

  const assignedEl = renderAssignedTo(doc, {
    user: root.assignedTo,
    userDirectory: context.services.userDirectory,
    onChange: onAssigneeChange,
  });
  techLeadGroup.append(assignedEl);

  return techLeadGroup;
}

/**
 * Renders the header tile by delegating layout to the view's own header control, feeding it the
 * pieces the control does not build itself (the Tech Lead picker and the sprint picker) plus the
 * root's title, type color, and ETA.
 */
function renderHeader(
  doc: Document,
  root: TrackedWorkItem,
  context: EnhancedViewContext,
  typeMap: Map<string, TypeCatalogEntry>,
  sprints: SprintRef[],
  onAssigneeChange: (user: DirectoryUser) => void,
): {
  header: HTMLElement;
  sprintPickerHandle: SprintPickerHandle;
  expandAll: HTMLButtonElement;
  collapseAll: HTMLButtonElement;
} {
  const sprintPickerHandle = renderSprintControls(doc, sprints);
  const techLead = createTechLeadGroup(doc, root, context, onAssigneeChange);

  const {
    element: header,
    expandAllButton: expandAll,
    collapseAllButton: collapseAll,
  } = renderProjectTrackingHeader(doc, {
    // Scraped from ADO's still-visible breadcrumb bar (the overlay hides only the content landmark),
    // so the tile shows the query's real parent folders; a miss yields [] and the row stays hidden.
    breadcrumbs: detectAdoQueryFolderPath(doc),
    title: root.title,
    titleColor: typeColorOf(root.type, typeMap),
    techLead,
    eta: root.eta,
    now: context.services ? context.services.now() : new Date(),
    sprintPicker: sprintPickerHandle.element,
  });

  return { header, sprintPickerHandle, expandAll, collapseAll };
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
 * Renders the complete board: header + tree, wired with expand/collapse and sprint-picker filter controls.
 */
function renderBoard(
  doc: Document,
  root: TrackedWorkItem,
  context: EnhancedViewContext,
  typeMap: Map<string, TypeCatalogEntry>,
  sprints: SprintRef[],
  onAssigneeChange: (user: DirectoryUser) => void,
): HTMLElement {
  const board = doc.createElement("div");
  board.style.cssText = "padding:16px";

  // One serialized write queue per board (per tab): state edits never race on System.Rev.
  const services = context.services!;
  const stateWrites = new StateWriteQueue(services.writeState, services.logger);
  // One shared badge width for the whole board so every status badge renders the same size.
  const statusWidthCh = widestStatusLabelLength(root, typeMap);
  // The global board-column order, so a status colors by its position (identical across every type).
  const boardColumns = services.getBoardColumns();

  const { header, sprintPickerHandle, expandAll, collapseAll } = renderHeader(
    doc,
    root,
    context,
    typeMap,
    sprints,
    onAssigneeChange,
  );
  board.append(header);

  const treeContainer = doc.createElement("div");
  treeContainer.className = "awesomeado-tracking__tree";
  board.append(treeContainer);

  // Render tree with current filter state from the sprint picker.
  const renderTreeContent = () => {
    const filterOn = sprintPickerHandle.isFilterActive();
    const selectedSprint = filterOn ? sprintPickerHandle.selectedSprint() : null;
    const showPills = !filterOn;

    const allTwisties: HTMLButtonElement[] = [];
    treeContainer.innerHTML = "";
    // The epic is already summarized in the header (title + TechLead), so the tree lists its
    // children downward rather than repeating the epic as the top row.
    const rows = renderTree(
      doc,
      root.children,
      context,
      typeMap,
      selectedSprint,
      showPills,
      allTwisties,
      onAssigneeChange,
      stateWrites,
      0,
      statusWidthCh,
      boardColumns,
    );
    treeContainer.append(...rows);

    wireExpandCollapseButtons(expandAll, collapseAll, allTwisties);
  };

  renderTreeContent();

  // Wire the sprint picker's onFilterToggle to re-render the tree.
  const pickerElement = sprintPickerHandle.element;
  const button = pickerElement.querySelector(
    ".awesomeado-sprint-picker__button",
  ) as HTMLButtonElement;
  const select = pickerElement.querySelector(
    ".awesomeado-sprint-picker__select",
  ) as HTMLSelectElement;

  if (button) {
    button.addEventListener("click", () => {
      // The picker already toggles its internal state; just re-render.
      setTimeout(() => renderTreeContent(), 0);
    });
  }

  if (select) {
    select.addEventListener("change", () => {
      renderTreeContent();
    });
  }

  return board;
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
 * Returns true if validation passed, false otherwise.
 */
function validateAndRenderErrors(
  result: WorkItemTreeResult,
  root: HTMLElement,
  doc: Document,
  services: EnhancedViewServices,
): boolean {
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
    return false;
  }

  if (!isTreeQuery) {
    renderValidationError(root, doc, "Project Tracking requires a tree (work item links) query.");
    return false;
  }

  return validateRoot(result, root, doc, firstType) !== null;
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
): { seed(roots: TrackedWorkItem[]): void; onAssigneeChange(user: DirectoryUser): void } {
  const known = new Set<string>();
  const assignees: FeatureCrewAssignee[] = [];

  const add = (assignee: FeatureCrewAssignee): boolean => {
    const key = assignee.alias.toLowerCase();
    if (known.has(key)) {
      return false;
    }
    known.add(key);
    assignees.push(assignee);
    return true;
  };

  const reconcile = (): void => {
    void services.featureCrew.reconcile({ rootId, typeName, assignees: [...assignees] });
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
        reconcile();
      }
    },
  };
}

/**
 * The Project Tracking view renderer: a live tree board with sprint filtering, expand/collapse, and description toggles.
 */
export const projectTrackingView: EnhancedView = {
  id: projectTrackingViewType.id,
  render: (context) => {
    const root = context.doc.createElement("section");
    root.className = "awesomeado-view awesomeado-tracking";
    root.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "min-height:100%",
      "box-sizing:border-box",
      "font-family:inherit",
      "color:var(--text-primary-color, inherit)",
      "text-align:left",
      "padding:16px",
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

    services
      .loadTree(context.queryId)
      .then((result) => {
        // Remove title and loading, render error or board.
        root.innerHTML = "";

        if (!validateAndRenderErrors(result, root, context.doc, services)) {
          return;
        }

        const treeRoot = result.roots[0]!;
        const types = services.getTypes();
        const typeMap = new Map(types.map((t) => [t.name, t]));
        const serviceSprints = services.getSprints();
        const sprints =
          serviceSprints.length > 0 ? serviceSprints : collectSprintsFromTree(treeRoot);

        // Keep the project's Feature Crew roster in sync with who is assigned. The roster item is
        // parked under the LAST configured type and linked to the root (the FIRST type); with no
        // types configured there is nowhere to store it, so the sync is skipped.
        const lastTypeName = types[types.length - 1]?.name;
        const crewSync =
          lastTypeName === undefined
            ? null
            : createFeatureCrewSync(services, treeRoot.id, lastTypeName);
        const onAssigneeChange = (user: DirectoryUser): void => {
          crewSync?.onAssigneeChange(user);
        };

        const board = renderBoard(
          context.doc,
          treeRoot,
          context,
          typeMap,
          sprints,
          onAssigneeChange,
        );
        root.append(board);

        // Reconcile once now the whole tree is known (create-if-missing, append any new assignees).
        crewSync?.seed([treeRoot]);
      })
      .catch((err: unknown) => {
        services.logger.error("Project Tracking failed to load its tree", err);
        root.innerHTML = "";
        root.append(
          renderViewScaffold(context.doc, {
            title: "Project Tracking",
            message: "Could not load this query.",
          }),
        );
      });

    return root;
  },
};
