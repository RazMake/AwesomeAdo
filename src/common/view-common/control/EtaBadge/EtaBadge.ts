import { describeEtaCountdown } from "../../../datetime/etaCountdown";
import { formatPstDate, formatPstDateInput } from "../../../datetime/pstDateTime";
import { createPopupHost } from "../popupHost/popupHost";

/**
 * Options for rendering an ETA badge.
 */
export interface EtaBadgeOptions {
  /** The target ETA date (ISO 8601); null or empty means no ETA is set. */
  eta: string | null;
  /** The reference point (current time) for countdown calculation. */
  now: Date;
  /**
   * The completion timestamp when the owning item is completed. Omit for active items; null means
   * the item is completed but its completion time is unknown.
   */
  completedAt?: string | null;
  /**
   * When provided, the badge becomes editable: it shows a hand cursor and clicking opens a small
   * date-picker popup. Picking a date calls this with the chosen date as an ISO timestamp; the popup
   * also offers a Clear button (only while an ETA is set) that calls this with `null`. Omit it for a
   * read-only badge. The caller persists the choice and then reflects the committed value via
   * `setEta` (the badge does not update itself, mirroring the status badge's persist-then-reflect
   * flow, so a failed write never leaves a misleading date on screen).
   */
  onChange?: (eta: string | null) => void;
}

/**
 * A rendered ETA badge plus the handle its owner uses to reflect a committed ETA change.
 *
 * The element is returned directly (so callers can append it), augmented with `setEta`. After the
 * owner persists a picked/cleared date it calls `setEta` with the new value and the badge re-renders
 * its label, color, weight, and countdown tooltip — the caller never reaches into the badge's styles.
 */
export interface EtaBadgeHandle extends HTMLElement {
  /** Update the displayed ETA (or `null` to show "No ETA") after a committed write. */
  setEta(eta: string | null): void;
  /** Update completion context after a committed status change; omit the value for an active item. */
  setCompletedAt(completedAt: string | null | undefined): void;
}

// Muted, theme-aware color for the "No ETA" placeholder — reads on both light and dark ADO themes.
const NO_ETA_COLOR = "var(--text-secondary-color)";
const ON_TIME_COMPLETION_COLOR = "var(--completion-foreground)";

/** Completed work is green only when its completion day did not pass its ETA day. */
function completedEtaColor(eta: string, completedAt: string | null | undefined): string {
  if (!completedAt) {
    return NO_ETA_COLOR;
  }
  const completedDate = new Date(completedAt);
  if (Number.isNaN(completedDate.getTime())) {
    return NO_ETA_COLOR;
  }
  const atCompletion = describeEtaCountdown(eta, completedDate);
  return atCompletion.text && atCompletion.severity !== "overdue"
    ? ON_TIME_COMPLETION_COLOR
    : NO_ETA_COLOR;
}

// Popup chrome is drawn with fixed low-alpha greys rather than a neutral palette token. Theme
// neutrals are intentionally subtle surface washes, while these outlines must stay distinct from
// the surface on every palette. The same self-contained contrast rule is used by the tracking header
// and sprint picker.
const POPUP_BORDER = "1px solid var(--control-border-strong)";
const CLEAR_BORDER = "1px solid var(--control-border)";
const CLEAR_BACKGROUND = "var(--control-background-subtle)";
// Hover feedback for Clear: the same grey at a stronger alpha, so the affordance is visible on any
// theme without picking a per-theme highlight color.
const CLEAR_HOVER_BACKGROUND = "var(--control-background-hover)";

const PICKER_STYLE_ID = "awesomeado-eta-picker-style";

/**
 * Give the date field's calendar button a hand cursor.
 *
 * The browser draws that button as a UA pseudo-element whose own stylesheet pins `cursor:default`,
 * so no inline style can reach it — a real stylesheet rule is the only way to advertise that it is
 * clickable. Injected on each popup open rather than once at load: ADO re-renders its page and drops
 * foreign nodes, and the id guard makes the re-add idempotent.
 */
function ensurePickerCursorStyle(doc: Document): void {
  if (doc.getElementById(PICKER_STYLE_ID)) {
    return;
  }
  const style = doc.createElement("style");
  style.id = PICKER_STYLE_ID;
  style.textContent = `.awesomeado-eta__date::-webkit-calendar-picker-indicator{cursor:pointer}`;
  (doc.head ?? doc.documentElement).append(style);
}

/**
 * Build the ETA date-picker popup. `close` dismisses it, so picking a date or clearing persists and
 * closes immediately (persist-on-select), mirroring the status badge's dropdown. It reads the latest
 * `currentEta` at open time to pre-fill the input and to offer Clear only while an ETA is actually
 * set (Clear is the only safe JSON Patch `remove`, and pointless when there is nothing to clear).
 */
function buildEtaPopup(
  doc: Document,
  currentEta: string | null,
  onChange: EtaBadgeOptions["onChange"],
  close: () => void,
): HTMLElement {
  const popup = doc.createElement("div");
  popup.className = "awesomeado-eta__popup";
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "display:flex",
    "align-items:center",
    "gap:6px",
    "background:var(--callout-background-color)",
    `border:${POPUP_BORDER}`,
    "border-radius:3px",
    "box-shadow:0 2px 8px var(--shadow-subtle)",
    "padding:6px",
    "z-index:1000",
  ].join(";");

  const input = doc.createElement("input");
  input.type = "date";
  input.className = "awesomeado-eta__date";
  ensurePickerCursorStyle(doc);
  // Pre-fill with the current ETA's PST calendar date so editing starts from what is shown.
  const initial = currentEta ? formatPstDateInput(currentEta) : "";
  if (initial) {
    input.value = initial;
  }
  input.style.cssText = [
    "font:inherit",
    "color:var(--text-primary-color)",
    // Deliberately transparent rather than an --input-background token: that token is not one the
    // view pins, so on a pinned dark theme over a light ADO page it painted the field white and hid
    // the browser's own calendar button. Sitting on the popup's themed surface keeps it legible.
    "background:transparent",
    `border:${POPUP_BORDER}`,
    "border-radius:2px",
    "padding:2px 4px",
  ].join(";");
  input.addEventListener("change", () => {
    const picked = input.value;
    if (!picked) {
      return;
    }
    // Store noon UTC of the picked calendar day so the value renders as that same date in PST
    // (midnight UTC would fall on the previous PST day and shift the date the user just picked).
    onChange?.(`${picked}T12:00:00Z`);
    close();
  });
  popup.append(input);

  // Clear is only meaningful (and only a safe JSON Patch `remove`) when an ETA is actually set.
  if (currentEta) {
    const clear = doc.createElement("button");
    clear.type = "button";
    clear.className = "awesomeado-eta__clear";
    clear.textContent = "Clear";
    clear.style.cssText = [
      "cursor:pointer",
      "font:inherit",
      "color:var(--text-primary-color)",
      `background:${CLEAR_BACKGROUND}`,
      `border:${CLEAR_BORDER}`,
      "border-radius:3px",
      "padding:2px 8px",
    ].join(";");
    clear.addEventListener("mouseenter", () => {
      clear.style.background = CLEAR_HOVER_BACKGROUND;
    });
    clear.addEventListener("mouseleave", () => {
      clear.style.background = CLEAR_BACKGROUND;
    });
    clear.addEventListener("click", () => {
      onChange?.(null);
      close();
    });
    popup.append(clear);
  }

  return popup;
}

/**
 * An ETA badge showing the target date, countdown text, and severity color.
 *
 * When no ETA is set (null or empty), displays "No ETA" in a muted color. Otherwise shows
 * "ETA MM/DD/YYYY" with a color reflecting urgency (overdue, soon, upcoming, distant) and a hover
 * tooltip carrying the countdown text ("in 2 weeks 3 days" or "overdue by 3 days"). An overdue ETA
 * is rendered in bold so a slipped date stands out at a glance.
 *
 * When `onChange` is provided the badge is editable: a hand cursor invites the click, and clicking
 * opens a date-picker popup (with a Clear button while an ETA is set). The popup's lifecycle
 * (outside-click / Escape dismissal) is owned by the shared popup host.
 */
export function renderEtaBadge(doc: Document, options: EtaBadgeOptions): EtaBadgeHandle {
  const { now, onChange } = options;
  const editable = typeof onChange === "function";

  // The currently-displayed ETA, tracked as mutable state because the popup is rebuilt each time it
  // opens (it must pre-fill the date input and decide whether to offer Clear from the latest value).
  let currentEta = options.eta;
  let currentCompletedAt = options.completedAt;

  // Root holds the badge's color/title/severity/weight (so callers and tests read them off the
  // returned element); position:relative anchors the popup. The visible text lives in a child
  // `label` span so the popup can mount as its SIBLING: were the popup a child of the trigger, a
  // click on the date input would bubble to the trigger and toggle the popup shut. Color and
  // font-weight inherit, so setting them on the root styles the label text.
  const root = doc.createElement("span") as EtaBadgeHandle;
  root.className = "awesomeado-eta";
  // Inline styling so ADO's stylesheet cannot restyle or hide this control.
  root.style.cssText = [
    "position:relative",
    "display:inline-flex",
    "align-items:center",
    "font:inherit",
    `cursor:${editable ? "pointer" : "default"}`,
  ].join(";");
  const label = doc.createElement("span");
  label.className = "awesomeado-eta__label";
  const textNode = doc.createTextNode("");
  label.append(textNode);
  root.append(label);

  const applyState = (eta: string | null): void => {
    currentEta = eta;
    // Reset the weight each render so a value that is no longer overdue drops back to normal.
    root.style.fontWeight = "normal";
    // "No ETA" says no deadline is planned, so it should recede next to the rows that carry a real date.
    // Dimming with opacity (on the label, never the root, so an open popup stays full-strength) mutes
    // whatever color the theme resolved, including on Follow ADO where the secondary-color token can
    // collapse into the primary text color and stop muting on its own.
    label.style.opacity = eta ? "1" : "0.6";
    if (!eta) {
      textNode.textContent = "No ETA";
      root.style.color = NO_ETA_COLOR;
      root.title = "";
      delete root.dataset.severity;
      return;
    }
    const countdown = describeEtaCountdown(eta, now);
    const completed = currentCompletedAt !== undefined;
    textNode.textContent = `ETA ${formatPstDate(eta)}`;
    root.style.color = completed ? completedEtaColor(eta, currentCompletedAt) : countdown.color;
    root.title = countdown.text;
    root.dataset.severity = countdown.severity;
    // An overdue ETA reads bold so a slipped date is unmissable among the other rows.
    if (!completed && countdown.severity === "overdue") {
      root.style.fontWeight = "bold";
    }
  };
  applyState(currentEta);

  if (editable) {
    // The popup lifecycle (toggle on click, outside-click and Escape dismissal) is owned by the
    // shared host. The label is the trigger; the popup mounts on the root as the label's SIBLING so a
    // click inside the popup never bubbles through the trigger and toggles it shut. It is rebuilt on
    // each open so it pre-fills from the latest ETA (and offers Clear only while one is set).
    createPopupHost({
      doc,
      trigger: label,
      mountInto: root,
      buildPopup: (close) => buildEtaPopup(doc, currentEta, onChange, close),
      interactive: true,
    });
  }

  root.setEta = (eta) => {
    applyState(eta);
  };
  root.setCompletedAt = (completedAt) => {
    currentCompletedAt = completedAt;
    applyState(currentEta);
  };
  return root;
}
