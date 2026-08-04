/** The class names a view stamps on its rows, so the shared rules can target that view's own DOM. */
export interface RowEmphasisClasses {
  /** Wraps one item: its own painted surface plus any nested children container. */
  wrapper: string;
  /** The painted surface inside a wrapper — the row and whatever panels belong to that same item. */
  surface: string;
  /** The nested-children container, which a collapsed branch hides with `display:none`. */
  children: string;
}

/**
 * Marks a view root while the emphasis modifier is held.
 *
 * Deliberately not namespaced per view: the modifier is one gesture the reader performs on the page,
 * so two views that both answer it must answer to the same marker rather than to look-alike names
 * that could silently drift apart.
 */
export const MODIFIER_HIGHLIGHT_CLASS = "awesomeado--modifier-highlight";

/**
 * The stripe alternation, painted from the theme's row roles.
 *
 * Rows are nested inside per-parent child containers, so CSS `:nth-child` restarts at every depth
 * and counts branches nobody has opened; the parity is therefore assigned explicitly (ADR-052) and
 * only read back here.
 */
export function createRowEmphasisStyle(
  doc: Document,
  classes: RowEmphasisClasses,
  extraSurfaceCss = "",
): HTMLStyleElement {
  const style = doc.createElement("style");
  const surface = `.${classes.wrapper} > .${classes.surface}`;
  const extra =
    extraSurfaceCss.trim().length === 0 ? "" : `\n${surface} {\n  ${extraSurfaceCss}\n}`;
  style.textContent = `${extra}
.${classes.wrapper}[data-row-stripe="base"] > .${classes.surface} {
  background-color: var(--item-row-background);
}
.${classes.wrapper}[data-row-stripe="alternate"] > .${classes.surface} {
  background-color: var(--item-row-alternate-background);
}
${surface}:hover {
  background-color: var(--item-row-hover-background);
}
.${MODIFIER_HIGHLIGHT_CLASS} ${surface}:hover {
  background-color: var(--item-row-emphasis-background);
}`;
  return style;
}

/** Whether every ancestor branch between one row and its container is currently open. */
function isRenderedRowVisible(
  row: HTMLElement,
  container: HTMLElement,
  childrenClass: string,
): boolean {
  for (let ancestor = row.parentElement; ancestor && ancestor !== container;) {
    if (ancestor.classList.contains(childrenClass) && ancestor.style.display === "none") {
      return false;
    }
    ancestor = ancestor.parentElement;
  }
  return true;
}

/** Reassign the stripes by visible reading order, after a branch changed what is on screen. */
export function restripeVisibleRows(container: HTMLElement, classes: RowEmphasisClasses): void {
  let visibleIndex = 0;
  for (const row of container.querySelectorAll<HTMLElement>(`.${classes.wrapper}`)) {
    if (!isRenderedRowVisible(row, container, classes.children)) {
      delete row.dataset.rowStripe;
      continue;
    }
    row.dataset.rowStripe = visibleIndex % 2 === 0 ? "base" : "alternate";
    visibleIndex += 1;
  }
}

/** Registers view roots that should follow the emphasis modifier for as long as they are mounted. */
export interface ModifierHighlightTracker {
  register(root: HTMLElement): void;
  unregister(root: HTMLElement): void;
}

const MODIFIER_HIGHLIGHT_TRACKERS = new WeakMap<Document, ModifierHighlightTracker>();

/**
 * Whether the emphasis modifier is held.
 *
 * Ctrl+Shift+Alt rather than a shorter combination: the shorter ones are spoken for by the browser
 * and by Azure DevOps' own page, so a reader reaching for emphasis would keep tripping over a
 * command they never meant to run.
 */
function isEmphasisModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey && event.shiftKey && event.altKey;
}

/**
 * One document-level modifier listener, shared by every view root registered against that document.
 *
 * Per document rather than per view because the gesture belongs to the page: two boards rendered in
 * one tab would otherwise install a listener each and disagree about whether the modifier is down.
 * The latched state is applied to a root the moment it registers, so a view painted while the keys
 * are already held is emphasized rather than waiting for the next keystroke.
 */
export function modifierHighlightTracker(doc: Document): ModifierHighlightTracker {
  const existing = MODIFIER_HIGHLIGHT_TRACKERS.get(doc);
  if (existing) return existing;

  const roots = new Set<HTMLElement>();
  let active = false;
  const apply = (next: boolean): void => {
    active = next;
    for (const root of roots) {
      if (!root.isConnected) {
        roots.delete(root);
        continue;
      }
      root.classList.toggle(MODIFIER_HIGHLIGHT_CLASS, active);
    }
  };
  const onKey = (event: KeyboardEvent): void => apply(isEmphasisModifier(event));
  doc.addEventListener("keydown", onKey);
  doc.addEventListener("keyup", onKey);
  // Leaving the tab never reports the key-up, so the emphasis would otherwise stay latched on.
  doc.defaultView?.addEventListener("blur", () => apply(false));

  const tracker: ModifierHighlightTracker = {
    register: (root) => {
      roots.add(root);
      root.classList.toggle(MODIFIER_HIGHLIGHT_CLASS, active);
    },
    unregister: (root) => {
      roots.delete(root);
      root.classList.remove(MODIFIER_HIGHLIGHT_CLASS);
    },
  };
  MODIFIER_HIGHLIGHT_TRACKERS.set(doc, tracker);
  return tracker;
}
