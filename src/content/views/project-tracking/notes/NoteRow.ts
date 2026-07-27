import type { NoteAuthor, WorkItemNote } from "../../../../common/ado/WorkItemNote";
import { isOwnNote } from "../../../../common/ado/WorkItemNote";
import { renderDateLabel } from "../../../../common/view-common/control/DateLabel/DateLabel";
import { renderMarkdownText } from "../../../../common/view-common/control/MarkdownText/MarkdownText";

import { renderNoteEditor } from "./NoteEditor";

/** What one note row shows, and what it may do about it. */
export interface NoteRowOptions {
  note: WorkItemNote;
  /** The signed-in reader; only their own notes offer the edit affordance. */
  currentUser: NoteAuthor | null;
  /**
   * Display names for the `@`-mention GUIDs in the note, keyed by lowercase GUID. Only consulted
   * when ADO sent no rendering of its own — which is exactly when the raw source, and its bare
   * GUIDs, is what gets rendered.
   */
  mentionNames: ReadonlyMap<string, string>;
  /**
   * Persist a correction to this note. Resolving `true` closes the editor and re-renders the row
   * with `text`; `false` leaves the editor open with the author's words intact.
   */
  onEdit(text: string): Promise<boolean>;
}

/**
 * The ink a note is written in: the surrounding theme's own text color, pulled off full strength and
 * warmed toward amber so a note reads as a softer aside next to the board's primary type.
 *
 * Derived from `--text-primary-color` rather than named outright, because a fixed brown that reads
 * on white is unreadable on the dark theme (and vice versa). Mixing keeps the theme's own
 * light-on-dark / dark-on-light polarity and makes only the tint ours, so this holds for light,
 * dark, blue and "Follow ADO" alike. Chromium below 111 (the manifest still admits 106) drops the
 * declaration as invalid and inherits the panel's untinted color — today's appearance, not a broken
 * one.
 */
const NOTE_TEXT_COLOR = "color-mix(in srgb, var(--text-primary-color, #323130) 72%, #b5892c)";

/**
 * One note, read as "{author} {date} {text}".
 *
 * The author's name doubles as the edit affordance, but ONLY for the person who wrote the note:
 * Azure DevOps rejects an edit from anyone else, so offering it to everyone would be a button whose
 * whole purpose is to fail. A name that is not clickable is styled as plain text, so the affordance
 * is visible rather than something a reader has to discover by hovering every row.
 */
export function renderNoteRow(doc: Document, options: NoteRowOptions): HTMLElement {
  const { note } = options;

  const row = doc.createElement("div");
  row.className = "awesomeado-note";
  row.style.cssText = [
    "font-size:11px",
    "padding:2px 0",
    "line-height:1.5",
    `color:${NOTE_TEXT_COLOR}`,
  ].join(";");

  const header = doc.createElement("span");
  header.className = "awesomeado-note__header";
  header.style.cssText = ["display:inline-flex", "align-items:baseline", "gap:6px"].join(";");
  header.append(createAuthor(doc, options));

  const date = renderDateLabel(doc, note.createdDate);
  date.style.opacity = "0.65";
  header.append(date);

  const body = doc.createElement("div");
  body.className = "awesomeado-note__text";
  body.append(
    renderMarkdownText(doc, {
      text: note.text,
      html: note.renderedHtml,
      mentionNames: options.mentionNames,
    }),
  );

  row.append(header, body);

  return row;
}

/**
 * The author's name: an inline edit trigger when it is the reader's own note, plain text otherwise.
 *
 * Swapping the whole row into the editor (rather than opening a dialog) keeps the correction where
 * the note is, which matters on a dense board where a note is two lines long.
 */
function createAuthor(doc: Document, options: NoteRowOptions): HTMLElement {
  const { note } = options;
  const name = note.author.displayName.length > 0 ? note.author.displayName : "Unknown";

  if (!isOwnNote(note, options.currentUser)) {
    const plain = doc.createElement("span");
    plain.className = "awesomeado-note__author";
    plain.textContent = name;
    plain.style.cssText = ["font-weight:600", "opacity:0.85"].join(";");
    return plain;
  }

  const trigger = doc.createElement("button");
  trigger.className = "awesomeado-note__author awesomeado-note__author--editable";
  trigger.type = "button";
  trigger.textContent = name;
  trigger.title = "Edit this note";
  trigger.style.cssText = [
    "cursor:pointer",
    "border:none",
    "background:none",
    "padding:0",
    "font:inherit",
    "font-weight:600",
    "text-decoration:underline",
    "color:var(--communication-foreground, #6b9fff)",
  ].join(";");
  trigger.addEventListener("click", () => openEditor(doc, trigger, options));
  return trigger;
}

/** Replace the row's contents with the editor, restoring them when the edit ends. */
function openEditor(doc: Document, trigger: HTMLElement, options: NoteRowOptions): void {
  const row = trigger.closest(".awesomeado-note");
  if (!(row instanceof HTMLElement)) {
    return;
  }
  const restored = Array.from(row.childNodes);
  const close = (): void => {
    row.replaceChildren(...restored);
  };
  const editor = renderNoteEditor(doc, {
    initialText: options.note.text,
    submitLabel: "Save",
    onSubmit: (text) => options.onEdit(text),
    onCancel: close,
  });
  row.replaceChildren(editor);
}
