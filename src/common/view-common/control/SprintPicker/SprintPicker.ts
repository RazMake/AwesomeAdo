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

  // Inline SVG funnel icon (theme-monochrome, inherits currentColor).
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
  button.append(svg);

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
  select.style.cssText = [
    "background:var(--background-color, #fff)",
    "color:var(--text-primary-color, #323130)",
    "border:1px solid rgba(128,128,128,0.5)",
    "border-radius:6px",
    "padding:4px 8px",
    "font:inherit",
  ].join(";");

  // Populate the select with sprint options (value = raw name for matching; label = display text).
  for (const sprint of sprints) {
    const option = doc.createElement("option");
    option.value = sprint.name;
    option.textContent = sprint.label ?? sprint.name;
    select.append(option);
  }

  // Select the initial sprint.
  if (selectedName && sprints.some((s) => s.name === selectedName)) {
    select.value = selectedName;
  } else if (sprints.length > 0) {
    select.value = sprints[0]!.name;
  }

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
    onSprintChange?.(select.value);
  });

  return {
    element: root,
    isFilterActive: () => active,
    selectedSprint: () => (sprints.length > 0 ? select.value : null),
  };
}
