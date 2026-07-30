import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import type { MarkerTags, WorkItemMarker } from "../../../../common/settings/ExtensionSettings";
import { renderMarkerPill } from "../../../../common/view-common/control/MarkerPill/MarkerPill";
import { createPopupHost } from "../../../../common/view-common/control/popupHost/popupHost";
import { renderNotesPanel, type NotesPanelServices } from "../notes/NotesPanel";

/** What a row's marker pill needs to show the notes that explain it. */
export interface MarkerReasonsPillOptions {
  doc: Document;
  item: TrackedWorkItem;
  marker: WorkItemMarker;
  /** The team's tag and comment token for this marker; the token is what identifies its notes. */
  tags: MarkerTags;
  /** ISO 8601 start of the binding's Updates window; nothing older is fetched or shown. */
  notesSinceIso: string;
  services: NotesPanelServices;
}

/** Wide enough for a sentence of prose without the popup taking over the row it belongs to. */
const POPUP_WIDTH_PX = 380;

/**
 * The pill an item wears for a marker, opening the notes that say WHY it wears it.
 *
 * A pill states a condition but never its reason, so reading one meant opening the item's whole
 * discussion and picking the marker notes out of it by eye. Answering it where the question is asked
 * — on the pill itself — is what makes the board's own claim checkable.
 */
export function renderMarkerReasonsPill(options: MarkerReasonsPillOptions): HTMLElement {
  const { doc, marker, tags } = options;
  const shell = doc.createElement("span");
  shell.className = "awesomeado-marker-reasons";
  shell.style.cssText = ["position:relative", "display:inline-flex", "margin-left:6px"].join(";");
  const tagTitle = `Azure DevOps tag "${tags.tag}"`;

  if (tags.commentTag.length === 0) {
    // With no comment token configured, nothing identifies which notes explain this marker: the pill
    // would open an empty list and read as "nobody said why", which is a different claim.
    shell.append(renderMarkerPill(doc, { marker, title: tagTitle }));
    return shell;
  }

  const pill = renderMarkerPill(doc, {
    marker,
    title: `${tagTitle} — click to read why`,
    onActivate: () => host.toggle(),
  });
  const host = createPopupHost({
    doc,
    trigger: pill,
    mountInto: shell,
    buildPopup: () => buildReasonsPopup(options),
    // The pill wires its own click (it has to stop the row underneath from opening its notes too);
    // letting the host wire a second one would toggle twice and the popup would never appear.
    interactive: false,
  });
  shell.append(pill);
  return shell;
}

/** The floating list of this marker's notes, newest first. */
function buildReasonsPopup(options: MarkerReasonsPillOptions): HTMLElement {
  const { doc } = options;
  const popup = doc.createElement("div");
  popup.className = "awesomeado-marker-reasons__popup";
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    `width:${POPUP_WIDTH_PX}px`,
    "max-width:90vw",
    "max-height:320px",
    "overflow-y:auto",
    "padding:8px",
    "z-index:1000",
    // The row it hangs off is a single nowrap line; a popup inheriting that would run off the board.
    "white-space:normal",
    "text-align:left",
    "font-size:11px",
    "background:var(--callout-background-color)",
    "border:1px solid var(--control-border-emphasis)",
    "border-radius:3px",
    "box-shadow:0 4px 12px var(--popup-shadow-strong)",
    "color:var(--text-primary-color)",
  ].join(";");

  const notes = renderNotesPanel({
    doc,
    workItemId: options.item.id,
    sinceIso: options.notesSinceIso,
    services: options.services,
    onlyCommentPrefix: options.tags.commentTag,
  });
  // Built for life under a row: hidden until expanded, and indented to clear the tree's gutter.
  notes.element.style.paddingLeft = "0";
  notes.setExpanded(true);
  popup.append(notes.element);
  return popup;
}
