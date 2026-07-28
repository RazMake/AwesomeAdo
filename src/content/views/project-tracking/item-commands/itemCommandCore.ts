import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { buildWorkItemUrl } from "../../../../common/ado/fetchAdoTree";
import type { EnhancedViewServices } from "../../../../common/view-common/EnhancedView";

/**
 * What every per-item command needs, whatever it goes on to do: the item, somewhere to persist a
 * change, and a way to show the result.
 *
 * Split out of any one command family so the editing commands and the marker-tagging commands share
 * one shape — and, more importantly, one panel chrome and one write path. Two families each rolling
 * their own would drift in exactly the invariants that must not vary: which queue serializes the
 * write, and who folds the new rev back onto the item.
 */
export interface ItemCommandTarget {
  doc: Document;
  /** The item the commands act on. Mutated in place on a successful write, like every other edit. */
  item: TrackedWorkItem;
  services: EnhancedViewServices;
  /** The board's single serialized write queue, so these edits cannot race the row controls. */
  queue: WorkItemWriteQueue;
  /** Repaints the board, so a changed title, sprint or tag shows without a re-read. */
  onChanged: () => void;
}

/** How wide an editor opens inside the menu. */
export const EDITOR_WIDTH_PX = 420;

/** How a panel is sized: a fixed editor width, or a share of the window. */
export interface PanelShape {
  /** Whether the item's title is shown under its number — false where the panel EDITS the title. */
  withTitle: boolean;
  widthPx?: number;
  width?: string;
  height?: string;
}

/**
 * Wraps a panel's contents in a heading that says which item it is about.
 *
 * A panel opened from a right-click has nothing else to identify itself with: the menu covers the
 * row it came from, and a box holding one field's text looks the same for every item on the board.
 * The number is the link into Azure DevOps, so the surface that edits an item is also the shortest
 * way to go and look at the rest of it.
 */
export function panelFor(
  doc: Document,
  item: TrackedWorkItem,
  shape: PanelShape,
  contents: HTMLElement[],
): HTMLElement {
  const panel = doc.createElement("div");
  panel.className = "awesomeado-item-command__panel";
  panel.style.cssText = ["display:flex", "flex-direction:column", "min-width:0"].join(";");
  panel.style.width = shape.width ?? `${shape.widthPx ?? 0}px`;
  panel.style.maxWidth = "90vw";
  if (shape.height) {
    panel.style.height = shape.height;
  }
  panel.append(renderPanelHeading(doc, item, shape.withTitle), ...contents);
  return panel;
}

/** The heading itself: `#{id}` as a link into ADO, and optionally the item's title beneath it. */
function renderPanelHeading(doc: Document, item: TrackedWorkItem, withTitle: boolean): HTMLElement {
  const heading = doc.createElement("div");
  heading.className = "awesomeado-item-command__heading";
  heading.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "align-items:flex-start",
    "gap:2px",
    "margin-bottom:6px",
  ].join(";");
  heading.append(renderIdLink(doc, item.id));

  if (withTitle) {
    const title = doc.createElement("div");
    title.className = "awesomeado-item-command__title";
    title.textContent = item.title;
    title.style.cssText = [
      "font-size:12px",
      "font-weight:600",
      "color:var(--text-primary-color, #323130)",
    ].join(";");
    heading.append(title);
  }
  return heading;
}

/**
 * The item's number, as the link that opens it in Azure DevOps.
 *
 * A page whose address does not name an ADO project leaves it plain text rather than a link that
 * goes nowhere — the number is still worth showing, it just cannot be followed.
 */
function renderIdLink(doc: Document, id: number): HTMLElement {
  const url = buildWorkItemUrl(doc.location?.href ?? "", id);
  const element = doc.createElement(url === null ? "span" : "a");
  element.className = "awesomeado-item-command__id";
  element.textContent = `#${id}`;
  element.style.cssText = [
    "font-size:11px",
    "font-weight:600",
    `color:var(--communication-foreground, #0078d4)`,
    "text-decoration:none",
  ].join(";");
  if (url !== null) {
    const link = element as HTMLAnchorElement;
    link.href = url;
    // noopener/noreferrer so the opened ADO tab cannot reach back into the page the extension runs in.
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = "Open in Azure DevOps";
  }
  return element;
}

/** Repaint the board and dismiss the menu, in that order, after a command committed. */
export function finish(target: ItemCommandTarget, close: () => void): void {
  target.onChanged();
  close();
}

/**
 * One work item change: the field it sets, and anything else that belongs in the SAME revision.
 *
 * Taken as an object rather than a run of positional arguments so that adding what a change carries
 * (its storage format, the reason for it) reads at the call site instead of trailing `undefined`s —
 * and so the shape itself says that these travel together in one patch.
 */
export interface ItemFieldChange {
  field: string;
  value: string;
  /** Put a MULTILINE field into this storage format as part of the same write (e.g. a description). */
  multilineFormat?: "Markdown";
  /** A discussion comment recorded in the same revision, saying why the change was made. */
  comment?: string;
  /**
   * The value the field held when this change was computed from it.
   *
   * Worth supplying whenever the new value is DERIVED from the old one (a tag added to the tags
   * already there): it lets the write survive a rev the board never saw advance — a drag-reorder, a
   * note posted from the panel, an edit made in ADO's own tab — instead of being refused with an
   * HTTP 412 that no amount of retrying from the same stale board can get past. A concurrent change
   * to this very field is still refused.
   */
  baseValue?: string | null;
}

/**
 * Queue one field change and fold its new rev back onto the item.
 *
 * The rev is the item's own, updated here rather than by each caller, because every subsequent write
 * to the same item is tested against it — a caller that forgot would make its NEXT edit fail as a
 * concurrency conflict against a change it made itself.
 */
export async function writeField(
  target: ItemCommandTarget,
  change: ItemFieldChange,
): Promise<boolean> {
  const { item, queue } = target;
  const result = await queue.enqueue({
    id: item.id,
    currentRev: () => item.rev,
    ...change,
  });
  if (!result.ok || result.rev === undefined) {
    return false;
  }
  item.rev = result.rev;
  return true;
}
