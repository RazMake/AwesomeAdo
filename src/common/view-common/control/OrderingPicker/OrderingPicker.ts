import { ORDERING_POLICIES, type OrderingPolicy } from "../../../ordering/ItemOrdering";
import { createPopupHost } from "../popupHost/popupHost";

/** Options for rendering the ordering picker. */
export interface OrderingPickerOptions {
  /** The policy the items are ordered by right now; drives the tooltip and the checked row. */
  policy: OrderingPolicy;
  /**
   * Called with the newly picked policy so the caller can re-order what it is showing. Fired
   * immediately (pick-and-apply), and NOT fired when the already-active policy is picked — a view
   * rebuilds its rows in response, and rebuilding them to the identical order would collapse the
   * user's expanded items for no result.
   */
  onChange(policy: OrderingPolicy): void;
  /**
   * Why drag-to-reorder is unavailable under `policy`, or null when it is available. Called again
   * after every pick, so the glyph re-states the situation the new policy creates.
   *
   * The glyph doubles as the reorder affordance's status light because it is already the one place
   * that answers "what decides this order?": when a view can only honour a manual drag under one
   * policy, the same indicator has to say so, or the rows silently stop responding to a drag with no
   * explanation anywhere on screen. The RULE and its wording stay with the view (this is a reason
   * string, not a boolean); the control only presents it.
   */
  dragReorderUnavailable?(policy: OrderingPolicy): string | null;
}

// A single glyph reads as "sorting" in every locale and needs no translation, which is what lets the
// control sit in a crowded header band. Escaped rather than pasted so the source stays plain ASCII.
const SORT_GLYPH = "\u21C5";

// Marks the row for the policy currently in force. Rendered for every row (transparent when
// inactive) so switching the mark can never shift the labels sideways.
const ACTIVE_MARK = "\u2713";

/** The picker's label for a policy, falling back to the raw id for one this build no longer offers. */
function labelOf(policy: OrderingPolicy): string {
  return ORDERING_POLICIES.find((option) => option.value === policy)?.label ?? policy;
}

/** The hover/assistive text: what the items are ordered by, plus what clicking does. */
function describe(policy: OrderingPolicy): string {
  return `Ordering: ${labelOf(policy)}`;
}

// How the glyph looks in each of its two states. Both colors are pinned by every theme.
//
// The unavailable state is a deliberately WEAK warning: reordering by hand is off, which is worth
// noticing but is not an error the user has to fix. Red names the condition; the heavy transparency
// keeps it from reading as an alarm in a header the user looks at all day.
const GLYPH_AVAILABLE: GlyphAppearance = {
  color: "var(--text-secondary-color)",
  opacity: "0.7",
};
const GLYPH_UNAVAILABLE: GlyphAppearance = {
  color: "var(--status-error-text)",
  opacity: "0.25",
};

/** How the glyph paints itself in one of its two states. */
interface GlyphAppearance {
  color: string;
  opacity: string;
}

/** One selectable policy row, marked when it is the policy currently in force. */
function renderPolicyRow(doc: Document, option: (typeof ORDERING_POLICIES)[number]): HTMLElement {
  const row = doc.createElement("button");
  row.type = "button";
  row.className = "awesomeado-ordering__option";
  row.dataset.policy = option.value;
  row.setAttribute("role", "menuitemradio");
  row.style.cssText = [
    "cursor:pointer",
    "display:flex",
    "align-items:center",
    "gap:8px",
    "background-color:transparent",
    "border:none",
    "border-radius:3px",
    "padding:4px 8px",
    "margin:1px 4px",
    "width:calc(100% - 8px)",
    "text-align:left",
    "font:inherit",
    "color:var(--text-primary-color)",
    "white-space:nowrap",
  ].join(";");

  const mark = doc.createElement("span");
  mark.className = "awesomeado-ordering__mark";
  mark.textContent = ACTIVE_MARK;
  row.append(mark, doc.createTextNode(option.label));

  row.addEventListener("mouseenter", () => {
    row.style.backgroundColor = "var(--palette-neutral-4)";
  });
  row.addEventListener("mouseleave", () => {
    row.style.backgroundColor = "transparent";
  });
  return row;
}

/** The dropdown listing every policy; `close` dismisses it as soon as one is picked. */
function buildOrderingPopup(
  doc: Document,
  current: OrderingPolicy,
  pick: (policy: OrderingPolicy) => void,
  close: () => void,
): HTMLElement {
  const popup = doc.createElement("div");
  popup.className = "awesomeado-ordering__popup";
  popup.setAttribute("role", "menu");
  // Same themed callout surface every other popup control uses, so the board's menus read alike.
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "background:var(--callout-background-color)",
    "border:1px solid var(--palette-neutral-20)",
    "border-radius:3px",
    "box-shadow:0 2px 8px var(--shadow-subtle)",
    "min-width:200px",
    "padding:4px 0",
    "font-size:12px",
    "z-index:1000",
  ].join(";");

  for (const option of ORDERING_POLICIES) {
    const row = renderPolicyRow(doc, option);
    const isActive = option.value === current;
    row.setAttribute("aria-checked", String(isActive));
    const mark = row.querySelector<HTMLElement>(".awesomeado-ordering__mark");
    if (mark) {
      // Kept in the layout but invisible when inactive, so the labels stay aligned in one column.
      mark.style.visibility = isActive ? "visible" : "hidden";
    }
    if (isActive) {
      row.style.fontWeight = "600";
    }
    row.addEventListener("click", () => {
      pick(option.value);
      close();
    });
    popup.append(row);
  }

  return popup;
}

/**
 * A compact "how are these ordered?" indicator for a view header: one sorting glyph whose tooltip
 * names the ordering policy in force, and which opens a menu of the policies from
 * `common/ordering` when clicked.
 *
 * The control owns only the display: it reports a pick through `onChange` and re-labels itself, but
 * never re-orders anything and never persists the choice — the view that renders the items decides
 * what a new policy means for what is on screen.
 */
export function renderOrderingPicker(doc: Document, options: OrderingPickerOptions): HTMLElement {
  // The displayed policy is mutable state (not just the initial option) because the menu is rebuilt
  // on every open: after a pick, the check mark and the tooltip must describe the NEW policy rather
  // than freezing on the one the board started with.
  let current = options.policy;

  const root = doc.createElement("span");
  root.className = "awesomeado-ordering";
  root.style.cssText = ["position:relative", "display:inline-flex", "align-items:center"].join(";");

  const trigger = doc.createElement("button");
  trigger.type = "button";
  trigger.className = "awesomeado-ordering__trigger";
  trigger.textContent = SORT_GLYPH;
  trigger.setAttribute("aria-haspopup", "menu");
  // Deliberately discrete: a bare, muted glyph with no chrome, so it can sit in a header corner as a
  // quiet status indicator rather than competing with the board's real controls. It brightens on
  // hover, which is what tells the reader it is clickable at all.
  trigger.style.cssText = [
    "cursor:pointer",
    "border:none",
    "background-color:transparent",
    "padding:0 2px",
    `color:${GLYPH_AVAILABLE.color}`,
    "font-size:13px",
    "line-height:1",
    `opacity:${GLYPH_AVAILABLE.opacity}`,
  ].join(";");

  // Hover always reaches full opacity, including in the unavailable state: the tooltip carries the
  // reason, so the glyph has to be readable long enough for the pointer to rest on it.
  let restingOpacity = GLYPH_AVAILABLE.opacity;
  trigger.addEventListener("mouseenter", () => {
    trigger.style.opacity = "1";
  });
  trigger.addEventListener("mouseleave", () => {
    trigger.style.opacity = restingOpacity;
  });

  const applyDescription = (): void => {
    const unavailable = options.dragReorderUnavailable?.(current) ?? null;
    const appearance = unavailable === null ? GLYPH_AVAILABLE : GLYPH_UNAVAILABLE;
    restingOpacity = appearance.opacity;
    trigger.style.color = appearance.color;
    trigger.style.opacity = appearance.opacity;
    trigger.dataset.dragReorder = unavailable === null ? "available" : "unavailable";
    const description =
      unavailable === null ? describe(current) : `${describe(current)} \u2014 ${unavailable}`;
    trigger.title = description;
    trigger.setAttribute("aria-label", description);
  };
  applyDescription();
  root.append(trigger);

  const pick = (policy: OrderingPolicy): void => {
    if (policy === current) {
      return;
    }
    current = policy;
    applyDescription();
    options.onChange(policy);
  };

  createPopupHost({
    doc,
    trigger,
    mountInto: root,
    buildPopup: (close) => buildOrderingPopup(doc, current, pick, close),
  });

  return root;
}
