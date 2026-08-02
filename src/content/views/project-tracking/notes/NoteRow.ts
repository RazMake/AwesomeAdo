import type { NoteAuthor, WorkItemNote } from "../../../../common/ado/WorkItemNote";
import { MAX_NOTE_LENGTH, isOwnNote } from "../../../../common/ado/WorkItemNote";
import { renderDateLabel } from "../../../../common/view-common/control/DateLabel/DateLabel";
import { renderMarkdownText } from "../../../../common/view-common/control/MarkdownText/MarkdownText";
import type { TextEditorMentionOptions } from "../../../../common/view-common/control/TextEditor/MentionSuggestions";
import { renderTextEditor } from "../../../../common/view-common/control/TextEditor/TextEditor";

import { withMarkerCommentAsCode } from "./markerNotes";

/** What one note row shows, and what it may do about it. */
export interface NoteRowOptions {
  note: WorkItemNote;
  /** Alternate display source; editing still opens the complete stored note. */
  displayText?: string;
  /** Marker comment prefixes to show as inline code when this note opens with one. */
  codePrefixes?: readonly string[];
  /** Identity search used when this note opens for editing. */
  mentions: TextEditorMentionOptions;
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
const NOTE_TEXT_COLOR = "color-mix(in srgb, var(--text-primary-color) 72%, var(--note-foreground))";

/**
 * How far a wrapped note line sits in from the note's own left edge, in pixels.
 *
 * Small on purpose: enough that a continuation line reads as belonging to the note above it rather
 * than as a new entry, but not so far that a multi-line note loses the left edge the eye scans down
 * a panel by.
 */
const NOTE_WRAP_INDENT_PX = 12;

/**
 * One note, read as "{author} {date} {text}" — all on ONE line, with wrapped lines hanging slightly
 * indented under the name.
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
    // Contains the floated header below, so it can never spill onto the next note's row.
    "display:flow-root",
  ].join(";");

  const header = doc.createElement("span");
  header.className = "awesomeado-note__header";
  header.style.cssText = [
    "display:inline-flex",
    "align-items:baseline",
    "gap:6px",
    // Floated rather than stacked or left inline. Stacked, every note spent a whole line on its own
    // header before saying anything. Inline, a wrapped line would restart at the TEXT's column,
    // pushing a two-line note far to the right of the name it belongs to. Floating puts the first
    // line of the note beside the name and lets the rest fall back to the note's own edge.
    "float:left",
    "margin-right:8px",
  ].join(";");
  header.append(createAuthor(doc, options));

  const date = renderDateLabel(doc, note.createdDate);
  date.style.opacity = "0.65";
  header.append(date);

  const body = doc.createElement("div");
  body.className = "awesomeado-note__text";
  // Wrapped lines — and any further paragraph — land here, a little in from the note's edge, so they
  // read as a continuation of the name they sit under. The first line is pushed past the floated
  // header instead, which is what puts the note on the author's own line.
  body.style.paddingLeft = `${NOTE_WRAP_INDENT_PX}px`;
  const source = withMarkerCommentAsCode(
    options.displayText ?? note.text,
    options.codePrefixes ?? [],
  );
  body.append(
    renderMarkdownText(doc, {
      text: source,
      // Azure DevOps' own rendering carries the prefix as prose, so a note whose source was marked up
      // here has to be rendered FROM that source or the markers would simply not show.
      html: source === note.text ? note.renderedHtml : null,
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
    // The hand cursor plus a BROKEN underline: a solid underline reads as a link that navigates
    // somewhere, which this does not — it opens the note in place. Written as longhands because the
    // `text-decoration` shorthand's style component is the part older Chromium drops first, and
    // losing the whole declaration would leave the only affordance the cursor, which nobody sees
    // until they are already over it.
    "cursor:pointer",
    "border:none",
    "background:none",
    "padding:0",
    "font:inherit",
    "font-weight:600",
    "text-decoration-line:underline",
    "text-decoration-style:dashed",
    // Clear of the descenders, so the dashes stay legible as dashes rather than merging into the g's
    // and y's a display name is full of.
    "text-underline-offset:2px",
    "color:var(--communication-foreground)",
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
  const editor = renderTextEditor(doc, {
    initialText: options.note.text,
    submitLabel: "Save",
    maxLength: MAX_NOTE_LENGTH,
    mentions: { ...options.mentions, mentionNames: options.mentionNames },
    onSubmit: (text) => options.onEdit(text),
    onCancel: close,
  });
  row.replaceChildren(editor);
}
