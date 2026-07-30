/**
 * The neutral pill shown for an assigned person who has no Feature Crew tag yet. Kept short and
 * literal so it reads as an obvious "fill me in" placeholder in both the assignee chip and the
 * filter panel.
 */
export const UNTAGGED_LABEL = "??";

/** Options for rendering a Feature Crew tag pill. */
export interface TagPillOptions {
  /** The tag text; `null` or an empty string renders the neutral "??" (no tag) pill. */
  tag: string | null;
  /**
   * When true the pill is an interactive filter toggle (a `<button>`): unselected pills read dimmed
   * and selected pills read full-strength with a ring, so the active filter is obvious at a glance.
   * When false (the default) it is a static `<span>` label.
   */
  interactive?: boolean;
  /** When interactive, whether this pill is currently part of the active filter. */
  selected?: boolean;
  /** When interactive, called when the pill is clicked (the caller flips the selection and re-renders). */
  onToggle?: () => void;
}

/**
 * Derive a deterministic hue (0–359) from a tag string so the same tag always renders the same
 * bright color and different tags spread across the color wheel. A tiny rolling hash keeps it stable
 * across loads without a lookup table — the palette is unbounded because teams invent their own tags.
 */
function hueForTag(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

/**
 * The background color a tag pill wears: a bright, saturated fill unique to the tag, or a neutral
 * themed neutral for the untagged "??" bucket. The theme also supplies the shared foreground.
 */
export function tagPillBackground(tag: string | null): string {
  if (tag === null || tag.length === 0) {
    // Untagged is a semantic state, so its fill is selected by the active theme.
    return "var(--untagged-background)";
  }
  return `hsl(${hueForTag(tag)}, 75%, 42%)`;
}

/** Collapse a tag to its non-empty text, or `null` for the untagged ("??") bucket. */
function normalizeTag(tag: string | null): string | null {
  return tag !== null && tag.length > 0 ? tag : null;
}

/** The shared pill styling every tag pill wears, before any interactive (toggle) additions. */
function baseTagPillStyles(normalized: string | null): string[] {
  return [
    "display:inline-flex",
    "align-items:center",
    "vertical-align:middle",
    "border-radius:9px",
    "padding:1px 8px",
    "font-size:9px",
    "font-weight:600",
    "line-height:1.6",
    "white-space:nowrap",
    "color:var(--tag-foreground)",
    `background:${tagPillBackground(normalized)}`,
  ];
}

/**
 * Turn a pill into an interactive filter toggle: a hand cursor, an always-present 2px border (so
 * selecting/deselecting never shifts the pill's size — only its color changes), and a dim/full-
 * strength look so the selected (ringed) pills pop, plus the click handler.
 */
function applyInteractiveTagPill(
  pill: HTMLElement,
  styles: string[],
  selected: boolean,
  onToggle: (() => void) | undefined,
): void {
  (pill as HTMLButtonElement).type = "button";
  styles.push("cursor:pointer");
  styles.push(
    selected ? "border:2px solid var(--tag-selected-border)" : "border:2px solid transparent",
  );
  styles.push(selected ? "opacity:1" : "opacity:0.55");
  pill.addEventListener("click", () => onToggle?.());
}

/**
 * Render a Feature Crew tag as a colored pill. A real tag gets a bright, per-tag color; a missing tag
 * (`null`/empty) gets the neutral grey "??" pill. When `interactive`, it is a toggle button the tag
 * filter panel uses; otherwise it is a static label the assignee chip shows.
 */
export function renderTagPill(doc: Document, options: TagPillOptions): HTMLElement {
  const { tag, interactive = false, selected = false, onToggle } = options;
  const normalized = normalizeTag(tag);

  const pill = doc.createElement(interactive ? "button" : "span");
  pill.className = "awesomeado-tag-pill";
  if (normalized === null) {
    pill.classList.add("awesomeado-tag-pill--untagged");
  }
  if (interactive && selected) {
    pill.classList.add("awesomeado-tag-pill--selected");
  }
  pill.textContent = normalized ?? UNTAGGED_LABEL;

  const styles = baseTagPillStyles(normalized);
  if (interactive) {
    applyInteractiveTagPill(pill, styles, selected, onToggle);
  }

  pill.style.cssText = styles.join(";");
  return pill;
}
