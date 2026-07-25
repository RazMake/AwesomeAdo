import type { TrackedUser } from "../../../ado/TrackedWorkItem";
import { renderDateLabel } from "../DateLabel/DateLabel";

/** Which lifecycle moment the control describes. */
export type LifecycleEvent = "created" | "last-modified";

/** Options for rendering an item lifecycle info control. */
export interface ItemLifecycleInfoOptions {
  /** Whether this describes when the item was created or last modified. */
  event: LifecycleEvent;
  /** ISO 8601 timestamp of when the create/modify happened. */
  timestamp: string;
  /** The person who created or last changed the item; null when unknown. */
  user: TrackedUser | null;
}

// Human labels for each lifecycle moment. Kept as a map so the label wording lives in one place.
const EVENT_LABELS: Record<LifecycleEvent, string> = {
  created: "Created",
  "last-modified": "Last Modified",
};

/**
 * A lifecycle line reading "{Created|Last Modified} on: {date}".
 *
 * The event word carries a "By {full name}" tooltip so the actor is discoverable without spending
 * horizontal space on it, while the date reuses `DateLabel` (whose own tooltip shows the exact
 * "@ time PST"). Splitting the two tooltips keeps each hover scoped to the word it explains.
 */
export function renderItemLifecycleInfo(
  doc: Document,
  options: ItemLifecycleInfoOptions,
): HTMLElement {
  const { event, timestamp, user } = options;

  const root = doc.createElement("span");
  root.className = "awesomeado-lifecycle";
  // Inherit font/color so the line adapts to ADO's theme (light or dark).
  root.style.cssText = ["font:inherit", "color:inherit"].join(";");

  // The "Created on:" / "Last Modified on:" label is muted with opacity rather than a
  // secondary-color token: opacity dims whatever the inherited text color is, so the label reads as
  // muted on every theme (including Follow ADO, where secondary-color tokens can collapse into the
  // primary text color and stop muting). Only the label is dimmed — the date stays full-strength.
  const label = doc.createElement("span");
  label.className = "awesomeado-lifecycle__label";
  label.style.cssText = ["opacity:0.65", "cursor:default"].join(";");

  // The "Created" / "Last Modified" word owns the actor tooltip.
  const eventLabel = doc.createElement("span");
  eventLabel.className = "awesomeado-lifecycle__event";
  eventLabel.textContent = EVENT_LABELS[event];
  if (user?.displayName) {
    // title (not innerHTML) keeps a crafted display name inert.
    eventLabel.title = `By ${user.displayName}`;
  }
  label.append(eventLabel, doc.createTextNode(" on:"));

  const dateLabel = renderDateLabel(doc, timestamp);

  root.append(label, doc.createTextNode(" "), dateLabel);

  return root;
}
