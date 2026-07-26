import { describeEtaCountdown } from "../../../datetime/etaCountdown";
import { formatPstDate, formatPstDateInput } from "../../../datetime/pstDateTime";
import { renderDatePicker } from "../DatePicker/DatePicker";
import { ensureControlStyles } from "../controlStyles/controlStyles";
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
   * When provided, the badge becomes editable: it shows a hand cursor and clicking opens a small
   * editor with a date field, a calendar button, and a Clear button. Picking (or typing) a date
   * calls this with the chosen date as an ISO timestamp; Clear calls it with `null`. Omit it for a
   * read-only badge. The caller persists the choice and then reflects the committed value via
   * `setEta` (the badge does not update itself, mirroring the status badge's persist-then-reflect
   * flow, so a failed write never leaves a misleading date on screen).
   */
  onChange?: (eta: string | null) => void;
}

/**
 * A rendered ETA badge plus the handle its owner uses to reflect a committed ETA change.
 *
 * The element is returned directly (so callers can append it), augmented with `setEta` and
 * `setWriteError`. After the owner persists a picked/cleared date it calls `setEta` with the new
 * value and the badge re-renders its label, color, weight, and countdown tooltip — the caller never
 * reaches into the badge's styles. When the write fails instead, `setWriteError` marks the badge so
 * the user sees that the value on screen is still the stored one.
 */
export interface EtaBadgeHandle extends HTMLElement {
  /** Update the displayed ETA (or `null` to show "No ETA") after a committed write. */
  setEta(eta: string | null): void;
  /** Flag (message) or clear (`null`) a failed write, so a silent failure is never invisible. */
  setWriteError(message: string | null): void;
}

// Muted, theme-aware color for the "No ETA" placeholder — reads on both light and dark ADO themes.
const NO_ETA_COLOR = "var(--text-secondary-color, #8a8886)";

// A fixed mid-grey edge. ADO's own neutral tokens are nearly invisible under the "Follow ADO"
// theme, which left the date field looking borderless there; a literal grey reads on every theme.
const BORDER_COLOR = "rgba(128,128,128,0.45)";

const STYLE_ID = "awesomeado-eta-style";

// Two things no inline style can express: the hover feedback that tells the user the calendar and
// Clear buttons are clickable, and hiding Chrome's own calendar indicator inside the date field.
// The extension shows its own themed calendar instead, and two calendar affordances in one field
// (one of them unthemeable and impossible to keep on screen) would only confuse.
const STYLES = [
  ".awesomeado-eta__button:hover{background:rgba(128,128,128,0.3);}",
  ".awesomeado-eta__date::-webkit-calendar-picker-indicator{display:none;}",
].join("");

/** Store noon UTC of a picked calendar day so it renders as that same day in PST. */
function dayToIsoTimestamp(day: string): string {
  // Midnight UTC would fall on the previous PST day and silently shift the date the user picked.
  return `${day}T12:00:00Z`;
}

/** A small themed button for the popup's actions (calendar toggle, Clear). */
function createPopupButton(
  doc: Document,
  modifier: string,
  text: string,
  title: string,
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = `awesomeado-eta__button awesomeado-eta__${modifier}`;
  button.textContent = text;
  button.title = title;
  // A filled, bordered chip with a hand cursor: the previous flat glyph disappeared into the popup
  // background and gave no hint that it could be clicked.
  button.style.cssText = [
    "cursor:pointer",
    "font:inherit",
    "line-height:1.4",
    "color:var(--text-primary-color, #323130)",
    "background:var(--palette-neutral-8, rgba(128,128,128,0.18))",
    `border:1px solid ${BORDER_COLOR}`,
    "border-radius:3px",
    "padding:2px 8px",
  ].join(";");
  return button;
}

/** The typed-entry date field, pre-filled with the ETA's PST calendar day. */
function createDateField(doc: Document, currentEta: string | null): HTMLInputElement {
  const input = doc.createElement("input");
  input.type = "date";
  input.className = "awesomeado-eta__date";
  input.title = "Type a date, or pick one from the calendar";
  const initial = currentEta ? formatPstDateInput(currentEta) : "";
  if (initial) {
    input.value = initial;
  }
  input.style.cssText = [
    "font:inherit",
    "color:var(--text-primary-color, #323130)",
    "background:var(--background-color, transparent)",
    `border:1px solid ${BORDER_COLOR}`,
    "border-radius:3px",
    "padding:2px 4px",
  ].join(";");
  return input;
}

/**
 * Build the ETA editor popup. `close` dismisses it, so committing a date or clearing persists and
 * closes immediately (persist-on-select), mirroring the status badge's dropdown. It reads the latest
 * `currentEta` at open time to pre-fill the field and to pre-select the day in the calendar.
 *
 * The calendar is the extension's own (see the DatePicker control) rather than the browser's: the
 * native one cannot follow the view's theme, cannot be kept inside the window, and routed a pick
 * through a native `change` event that never reached the save.
 */
function buildEtaPopup(
  doc: Document,
  options: EtaBadgeOptions,
  currentEta: string | null,
  close: () => void,
): HTMLElement {
  ensureControlStyles(doc, STYLE_ID, STYLES);

  const popup = doc.createElement("div");
  popup.className = "awesomeado-eta__popup";
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "display:flex",
    "flex-direction:column",
    "align-items:flex-start",
    "gap:6px",
    "background:var(--callout-background-color, var(--background-color, #fff))",
    `border:1px solid ${BORDER_COLOR}`,
    "border-radius:3px",
    "box-shadow:0 2px 8px rgba(0,0,0,0.15)",
    "padding:6px",
    "z-index:1000",
  ].join(";");

  const commit = (eta: string | null): void => {
    options.onChange?.(eta);
    close();
  };

  const controls = doc.createElement("div");
  controls.style.cssText = "display:flex;align-items:center;gap:6px";

  const input = createDateField(doc, currentEta);
  input.addEventListener("change", () => {
    // An emptied field is a clear; the browser reports it as an empty value, not as null.
    commit(input.value ? dayToIsoTimestamp(input.value) : null);
  });

  const calendarButton = createPopupButton(doc, "calendar-btn", "\u{1F4C5}", "Show the calendar");
  // Clear is offered unconditionally so the action is always discoverable; with no ETA set there is
  // nothing to remove, so it just dismisses (a JSON Patch `remove` of an unset field would fail).
  const clearButton = createPopupButton(doc, "clear", "Clear", "Reset this item to No ETA");
  clearButton.addEventListener("click", () => {
    if (currentEta) {
      commit(null);
      return;
    }
    close();
  });
  controls.append(input, calendarButton, clearButton);

  const calendarHost = doc.createElement("div");
  calendarHost.className = "awesomeado-eta__calendar";
  calendarHost.style.display = "none";
  calendarHost.append(
    renderDatePicker(doc, {
      selected: currentEta ? formatPstDateInput(currentEta) : null,
      // "Today" is reckoned in PST, the timezone every date in these views is shown in.
      today: formatPstDateInput(options.now.toISOString()),
      onPick: (day) => commit(dayToIsoTimestamp(day)),
    }),
  );
  calendarButton.addEventListener("click", () => {
    calendarHost.style.display = calendarHost.style.display === "none" ? "block" : "none";
  });

  popup.append(controls, calendarHost);
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
 * opens an editor with a date field, a calendar button, and a Clear button. The popup's lifecycle
 * (outside-click / Escape dismissal, and staying inside the window) is owned by the shared popup
 * host.
 */
export function renderEtaBadge(doc: Document, options: EtaBadgeOptions): EtaBadgeHandle {
  const { now, onChange } = options;
  const editable = typeof onChange === "function";

  // The currently-displayed ETA, tracked as mutable state because the popup is rebuilt each time it
  // opens (it must pre-fill the date field and pre-select the calendar day from the latest value).
  let currentEta = options.eta;

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

  // A failed write leaves the badge showing the stored value; the warning marker is what tells the
  // user the date they picked did not stick, and it is cleared as soon as a value is committed.
  let writeError: string | null = null;
  const marker = doc.createElement("span");
  marker.className = "awesomeado-eta__write-error";
  // Empty until a write actually fails, so the badge's text content stays exactly the ETA label.
  marker.style.color = "#d13438";
  label.append(marker);

  const applyState = (eta: string | null): void => {
    currentEta = eta;
    // Reset the weight each render so a value that is no longer overdue drops back to normal.
    root.style.fontWeight = "normal";
    if (!eta) {
      textNode.textContent = "No ETA";
      root.style.color = NO_ETA_COLOR;
      root.title = writeError ?? "";
      delete root.dataset.severity;
      return;
    }
    const countdown = describeEtaCountdown(eta, now);
    textNode.textContent = `ETA ${formatPstDate(eta)}`;
    root.style.color = countdown.color;
    root.title = writeError ?? countdown.text;
    root.dataset.severity = countdown.severity;
    // An overdue ETA reads bold so a slipped date is unmissable among the other rows.
    if (countdown.severity === "overdue") {
      root.style.fontWeight = "bold";
    }
  };
  applyState(currentEta);

  if (editable) {
    // The popup lifecycle (toggle on click, outside-click and Escape dismissal) is owned by the
    // shared host. The label is the trigger; the popup mounts on the root as the label's SIBLING so a
    // click inside the popup never bubbles through the trigger and toggles it shut. It is rebuilt on
    // each open so it reflects the latest ETA.
    createPopupHost({
      doc,
      trigger: label,
      mountInto: root,
      buildPopup: (close) => buildEtaPopup(doc, options, currentEta, close),
      interactive: true,
    });
  }

  root.setEta = (eta) => {
    writeError = null;
    marker.textContent = "";
    applyState(eta);
  };
  root.setWriteError = (message) => {
    writeError = message;
    marker.textContent = message === null ? "" : " \u26A0";
    applyState(currentEta);
  };
  return root;
}
