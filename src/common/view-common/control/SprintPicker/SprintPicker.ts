/** Where a sprint sits relative to the current one; drives the option's emphasis in the dropdown. */
export type SprintRelation = "past" | "current" | "future";

/** A sprint option in the dropdown. */
export interface SprintOption {
  /** The iteration path (stable id). */
  path: string;
  /** The sprint display name. This is the value the picker reports back (selection + callbacks). */
  name: string;
  /**
   * Optional display text shown in the dropdown, e.g. `Current - Sprint 5`. Defaults to `name`. The
   * label is purely cosmetic: selection and the change/toggle callbacks still carry the raw `name`,
   * so a caller filtering by sprint name keeps working regardless of what the option shows.
   */
  label?: string;
  /**
   * Optional position relative to the current sprint. Purely cosmetic: past options read orange,
   * future options read in the theme accent, and the current one is bold, so the list's time
   * direction is obvious at a glance. Omit it for an unstyled option.
   */
  relation?: SprintRelation;
}

/** Options for rendering a sprint picker. */
export interface SprintPickerOptions {
  /** The team's sprints, in display order. */
  sprints: SprintOption[];
  /** The sprint name to select initially (default = the current sprint the caller computed); falls back to the first sprint. */
  selectedName?: string | null;
  /** Whether the filter starts active. Default false. */
  filterActive?: boolean;
  /** Called when the filter toggle flips; carries the new active state and the currently selected sprint name (or null). */
  onFilterToggle?: (active: boolean, selectedName: string | null) => void;
  /** Called when the selected sprint changes. */
  onSprintChange?: (selectedName: string) => void;
}

/** A handle for controlling and querying the sprint picker state. */
export interface SprintPickerHandle {
  /** The root element to mount. */
  element: HTMLElement;
  /** Whether the filter is currently active. */
  isFilterActive(): boolean;
  /** The currently selected sprint name, or null when there are no sprints. */
  selectedSprint(): string | null;
}

/**
 * Build the theme-monochrome funnel icon shown inside the filter toggle. It inherits `currentColor`
 * so it flips with the button's active/inactive text color without a separate style pass.
 */
function buildFunnelIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.style.cssText = "display:block";

  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  // A simple funnel shape: wide top narrowing to a spout at the bottom.
  path.setAttribute("d", "M2 2 L14 2 L10 8 L10 14 L6 14 L6 8 Z");
  path.setAttribute("fill", "currentColor");

  svg.append(path);
  return svg;
}

/**
 * Fill the dropdown with one option per sprint (value = raw name for matching, label = display text)
 * and select the initial sprint: the caller's `selectedName` when it matches an option, else the
 * first sprint. Kept separate so the picker's render stays focused on wiring, not list-building.
 */
function populateSprintSelect(
  doc: Document,
  select: HTMLSelectElement,
  sprints: SprintOption[],
  selectedName: string | null | undefined,
): void {
  for (const sprint of sprints) {
    const option = doc.createElement("option");
    option.value = sprint.name;
    option.textContent = sprint.label ?? sprint.name;
    applyRelationStyle(option, sprint.relation);
    select.append(option);
  }

  if (selectedName && sprints.some((s) => s.name === selectedName)) {
    select.value = selectedName;
  } else if (sprints.length > 0) {
    select.value = sprints[0]!.name;
  }
}

// Past sprints read in a warm amber that stays legible on both the light and dark ADO themes (the
// theme variables carry no "past/history" color, so this is a fixed tuned tone). Future sprints
// borrow the theme's own accent foreground so they match whatever palette ADO is rendering.
const PAST_SPRINT_COLOR = "#c26c1d";
const FUTURE_SPRINT_COLOR = "var(--communication-foreground, #0078d4)";

/**
 * The style declarations that express a sprint's position in time: past = amber, future = theme
 * accent, current = bold in the inherited color (emphasis without competing with the two colored
 * directions). Shared by the dropdown options and the collapsed select so both read identically.
 *
 * Exported because the dropdown is no longer the only place a sprint is offered — the item
 * right-click menu lists the same sprints as menu rows. Re-deriving the palette there would let the
 * two drift into disagreeing about which sprint is which.
 */
export function sprintRelationDeclarations(
  relation: SprintRelation | undefined,
): [string, string][] {
  if (relation === "past") {
    return [["color", PAST_SPRINT_COLOR]];
  }
  if (relation === "future") {
    return [["color", FUTURE_SPRINT_COLOR]];
  }
  if (relation === "current") {
    return [["font-weight", "bold"]];
  }
  return [];
}

/**
 * Apply a relation's declarations as individual longhand properties. `setProperty` (rather than a
 * `cssText` append) is deliberate: the select's base style uses the `font` shorthand, and only a
 * longhand set afterwards reliably wins over it.
 */
function applyRelationDeclarations(
  style: CSSStyleDeclaration,
  relation: SprintRelation | undefined,
): void {
  for (const [property, value] of sprintRelationDeclarations(relation)) {
    style.setProperty(property, value);
  }
}

/**
 * Tint an option by where its sprint sits in time. The relation is also mirrored onto
 * `data-relation` so callers and tests can assert it without parsing styles.
 */
function applyRelationStyle(option: HTMLOptionElement, relation: SprintRelation | undefined): void {
  if (!relation) {
    return;
  }
  option.dataset.relation = relation;
  applyRelationDeclarations(option.style, relation);
}

const SELECT_BASE_STYLE = [
  "background:var(--background-color, #fff)",
  "color:var(--text-primary-color, #323130)",
  "border:1px solid rgba(128,128,128,0.5)",
  "border-radius:6px",
  "padding:4px 8px",
  // Deliberately the font longhands instead of the `font` shorthand: the shorthand resets
  // font-weight, which would fight the current-sprint bold applied on top of this base style.
  "font-family:inherit",
  "font-size:inherit",
];

/**
 * Restyle the dropdown itself from the selected sprint's relation. Browsers render the collapsed
 * <select> with the select's own color/weight and ignore the selected <option>'s styling, so
 * without this the time-direction cue would vanish the moment the dropdown closes.
 */
function styleSelectForSelection(select: HTMLSelectElement, sprints: SprintOption[]): void {
  const relation = sprints.find((sprint) => sprint.name === select.value)?.relation;
  if (relation) {
    select.dataset.relation = relation;
  } else {
    delete select.dataset.relation;
  }
  select.style.cssText = SELECT_BASE_STYLE.join(";");
  applyRelationDeclarations(select.style, relation);
}

/**
 * A sprint filter control = an ICON filter toggle button in front of a sprint dropdown.
 *
 * The filter button uses an SVG funnel icon (not text) and shows its active state via aria-pressed
 * and a subtle themed "on" look. The dropdown is a native <select> populated with the sprint options.
 * Clicking the button toggles the filter and calls onFilterToggle; changing the select calls onSprintChange.
 */
export function renderSprintPicker(
  doc: Document,
  options: SprintPickerOptions,
): SprintPickerHandle {
  const { sprints, selectedName, filterActive = false, onFilterToggle, onSprintChange } = options;

  let active = filterActive;
  const isEmpty = sprints.length === 0;

  // Root container: inline-flex row with button first, then select.
  const root = doc.createElement("span");
  root.className = "awesomeado-sprint-picker";
  root.style.cssText = ["display:inline-flex", "align-items:center", "gap:6px"].join(";");

  // The filter toggle button with an SVG funnel icon.
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "awesomeado-sprint-picker__button";
  button.setAttribute("aria-label", "Filter by sprint");
  button.title = "Filter by sprint";
  button.disabled = isEmpty;
  button.append(buildFunnelIcon(doc));

  // Apply theme-aware styling to the button.
  const updateButtonStyle = () => {
    // Active = clearly LIT UP with the accent (background + matching border + on-accent text/icon),
    // not a faint tint, so "filter on" is obvious. Inactive stays transparent with a visible border.
    const bg = active ? "var(--communication-background, #0078d4)" : "transparent";
    const fg = active
      ? "var(--text-on-communication-background, #fff)"
      : "var(--text-primary-color, #323130)";
    const border = active ? "var(--communication-background, #0078d4)" : "rgba(128,128,128,0.5)";
    button.style.cssText = [
      `background:${bg}`,
      `color:${fg}`,
      `border:1px solid ${border}`,
      "border-radius:6px",
      "padding:4px 6px",
      "cursor:pointer",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");
    button.setAttribute("aria-pressed", active ? "true" : "false");
  };
  updateButtonStyle();

  // The sprint dropdown.
  const select = doc.createElement("select");
  select.className = "awesomeado-sprint-picker__select";
  // The dropdown is only meaningful while the filter is on: picking a sprint with the filter off
  // would change nothing, so keep it disabled until the funnel is toggled active (and always when
  // there are no sprints to choose from).
  const updateSelectEnabled = () => {
    select.disabled = isEmpty || !active;
  };
  updateSelectEnabled();

  populateSprintSelect(doc, select, sprints, selectedName);
  styleSelectForSelection(select, sprints);

  root.append(button, select);

  // Toggle filter on button click.
  button.addEventListener("click", () => {
    active = !active;
    updateButtonStyle();
    updateSelectEnabled();
    const currentSprint = sprints.length > 0 ? select.value : null;
    onFilterToggle?.(active, currentSprint);
  });

  // Call onSprintChange when the select changes.
  select.addEventListener("change", () => {
    styleSelectForSelection(select, sprints);
    onSprintChange?.(select.value);
  });

  return {
    element: root,
    isFilterActive: () => active,
    selectedSprint: () => (sprints.length > 0 ? select.value : null),
  };
}
