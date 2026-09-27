import type { TrackedWorkItem, TypeCatalogEntry } from "../../../../common/ado/TrackedWorkItem";
import { workItemTypeDisplayColor } from "../../../../common/ado/workItemTypes";
import type { EnhancedViewServices } from "../../../../common/view-common/EnhancedView";
import {
  renderItemTypeIcon,
  type ItemTypeIconEmphasis,
} from "../../../../common/view-common/control/ItemTypeIcon/ItemTypeIcon";

import { createNotesPanelState, renderNotesPanel, type NotesPanelState } from "./NotesPanel";

/** A mounted work-item type icon and the Discussion panel it controls. */
export interface ItemNotesToggleHandle {
  toggle: HTMLButtonElement;
  panel: HTMLElement;
  isExpanded(): boolean;
  setExpanded(expanded: boolean): void;
}

/** Everything needed to preserve one item's Discussion while its row is rebuilt. */
export interface ItemNotesToggleOptions {
  doc: Document;
  item: TrackedWorkItem;
  entry: TypeCatalogEntry | undefined;
  services: EnhancedViewServices;
  sinceIso: string;
  state?: NotesPanelState;
  expanded?: boolean;
  toggleClassName?: string;
  onExpandedChange?: (expanded: boolean) => void;
}

function emphasis(expanded: boolean, hasContent: boolean): ItemTypeIconEmphasis {
  return { colored: hasContent, loud: expanded };
}

function toggleTitle(expanded: boolean): string {
  return expanded ? "Hide notes" : "Show notes";
}

/**
 * The type icon that opens one item's Discussion.
 *
 * Its color carries the same three-state answer in every view: neutral when no notes are known,
 * dimmed in the work-item type color when notes exist, and full color while the panel is open.
 */
export function renderItemNotesToggle(options: ItemNotesToggleOptions): ItemNotesToggleHandle {
  const startsExpanded = options.expanded ?? false;
  let hasNotes = options.item.noteCount > 0;
  const icon = renderItemTypeIcon(options.doc, {
    iconUrl: options.entry?.icon ?? null,
    color: workItemTypeDisplayColor(options.entry?.color),
    typeName: options.item.type,
    title: "",
    emphasis: emphasis(startsExpanded, hasNotes),
  });
  const toggle = options.doc.createElement("button");
  toggle.className = options.toggleClassName ?? "awesomeado-item-notes__toggle";
  toggle.type = "button";
  toggle.style.cssText = [
    "cursor:pointer",
    "border:none",
    "background:none",
    "padding:0",
    "display:inline-flex",
    "align-items:center",
    "vertical-align:middle",
    "font:inherit",
    "color:inherit",
  ].join(";");
  toggle.append(icon.element);

  const notes = renderNotesPanel({
    doc: options.doc,
    workItemId: options.item.id,
    sinceIso: options.sinceIso,
    services: options.services,
    state: options.state ?? createNotesPanelState(),
    onItemRevision: (rev) => {
      options.item.rev = rev;
    },
    onNoteCountKnown: (count) => {
      hasNotes = count > 0;
      options.item.noteCount = count;
      icon.setEmphasis(emphasis(isExpanded(), hasNotes));
    },
  });
  const isExpanded = (): boolean => toggle.getAttribute("aria-expanded") === "true";
  const setExpanded = (expanded: boolean): void => {
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.title = toggleTitle(expanded);
    icon.setEmphasis(emphasis(expanded, hasNotes));
    notes.setExpanded(expanded);
    options.onExpandedChange?.(expanded);
  };
  setExpanded(startsExpanded);
  toggle.addEventListener("click", () => setExpanded(!isExpanded()));
  return { toggle, panel: notes.element, isExpanded, setExpanded };
}
