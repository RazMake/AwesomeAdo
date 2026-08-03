import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import type { MarkerTags, WorkItemMarker } from "../../../../common/settings/ExtensionSettings";
import { renderMarkerPill } from "../../../../common/view-common/control/MarkerPill/MarkerPill";
import { createPopupHost } from "../../../../common/view-common/control/popupHost/popupHost";
import {
  createNotesPanelState,
  renderNotesPanel,
  type NotesPanelServices,
  type NotesPanelState,
} from "../notes/NotesPanel";

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
  /** Current-lifetime acceptance, used only by the Interrupt pill paint. */
  accepted?: boolean;
}

/** Wide enough for a sentence of prose without the popup taking over the row it belongs to. */
const POPUP_WIDTH_PX = 380;
const noteStateByItem = new WeakMap<TrackedWorkItem, NotesPanelState>();

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

  const renderStatic = (title: string): void => {
    shell.replaceChildren(renderMarkerPill(doc, { marker, accepted: options.accepted, title }));
  };
  if (tags.commentTag.length === 0 || options.item.noteCount === 0) {
    renderStatic("No notes");
    return shell;
  }

  const notes = renderNotesPanel({
    doc,
    workItemId: options.item.id,
    sinceIso: options.notesSinceIso,
    services: options.services,
    state: notesState(options.item),
    onlyCommentPrefix: tags.commentTag,
    hideOnlyCommentPrefix: true,
    // A corrected marker note is a new revision of the item, so the row's own controls must be
    // tested against that one rather than the rev the board last read.
    onItemRevision: (rev) => {
      options.item.rev = rev;
    },
    onNoteCountKnown: (count) => {
      if (count === 0) {
        renderStatic("No notes");
        return;
      }
      const pill = renderMarkerPill(doc, {
        marker,
        accepted: options.accepted,
        onActivate: () => host.toggle(),
      });
      const host = createPopupHost({
        doc,
        trigger: pill,
        mountInto: shell,
        buildPopup: () => buildReasonsPopup(doc, notes.element),
        // The pill stops the row beneath from opening its complete discussion.
        interactive: false,
      });
      shell.replaceChildren(pill);
    },
    onNoteLoadFailed: () => renderStatic("Could not load notes"),
  });
  renderStatic("Loading notes");
  notes.setExpanded(true);
  return shell;
}

function notesState(item: TrackedWorkItem): NotesPanelState {
  const existing = noteStateByItem.get(item);
  if (existing !== undefined) return existing;
  const created = createNotesPanelState();
  noteStateByItem.set(item, created);
  return created;
}

/** The floating list of this marker's notes, newest first. */
function buildReasonsPopup(doc: Document, notes: HTMLElement): HTMLElement {
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
    "border-radius:8px",
    "box-shadow:0 4px 12px var(--popup-shadow-strong)",
    "color:var(--text-primary-color)",
  ].join(";");

  // Built for life under a row: hidden until expanded, and indented to clear the tree's gutter.
  notes.style.paddingLeft = "0";
  popup.append(notes);
  return popup;
}
