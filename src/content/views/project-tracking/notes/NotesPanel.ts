import type { IMentionDirectory } from "../../../../common/ado/IMentionDirectory";
import type { IWorkItemNoteLoader } from "../../../../common/ado/IWorkItemNoteLoader";
import type { IWorkItemNoteWriter } from "../../../../common/ado/IWorkItemNoteWriter";
import type { NoteAuthor, WorkItemNote } from "../../../../common/ado/WorkItemNote";
import { selectRecentNoteDays, sortNotesNewestFirst } from "../../../../common/ado/WorkItemNote";
import { resolveMentionsIn } from "../../../../common/browser/MessagingMentionDirectory";
import type { ILogger } from "../../../../common/logging/ILogger";

import { renderNoteComposer } from "./NoteComposer";
import { renderNoteRow } from "./NoteRow";

/** Everything one item's notes panel needs to fetch, show and author notes. */
export interface NotesPanelOptions {
  doc: Document;
  workItemId: number;
  /** ISO 8601 start of the binding's Updates window; nothing older is fetched or shown. */
  sinceIso: string;
  loader: IWorkItemNoteLoader;
  writer: IWorkItemNoteWriter;
  /**
   * Resolves the identity GUIDs the notes' `@`-mentions are stored as.
   *
   * Asked once per panel load, for every mention across the notes it just fetched — not per note and
   * not per mention. The directory memoizes, so the teammates already named by the board's
   * descriptions cost nothing here.
   */
  mentionDirectory: IMentionDirectory;
  logger: ILogger;
  /**
   * Called with the number of notes actually inside the Updates window, whenever that becomes known
   * or changes (after the first load, and after a note is added).
   *
   * The row seeds its icon from the item's total comment count, which is all the tree read knows;
   * that count includes comments older than the window, so an item can advertise notes and then open
   * to an empty panel. This is the correction — once the truth is known, the row can stop promising
   * something to read. Never called on a FAILED load: an unknown count must not be reported as none.
   */
  onNoteCountKnown?: (count: number) => void;
}

/** A mounted notes panel and the one thing the row that owns it changes about it. */
export interface NotesPanelHandle {
  element: HTMLElement;
  /** Show or hide the panel; the first show is what triggers the fetch. */
  setExpanded(expanded: boolean): void;
  isExpanded(): boolean;
}

/**
 * One work item's notes: the "+ Add note" link, then the notes themselves, newest first.
 *
 * Notes are fetched on FIRST EXPAND, not with the board. A tracking board routinely shows dozens of
 * items, and reading every one's discussion up front would fire dozens of requests for panels nobody
 * opens — the whole point of the collapsed state is that the reader has not asked for them yet.
 * The result is then kept, so re-opening the same panel is instant.
 *
 * The list is narrowed twice, deliberately: the Updates window bounds what is FETCHED (a per-query
 * setting, so a team that reviews fortnightly sees a fortnight), and the two-day rule bounds what is
 * SHOWN, so an expanded panel stays a glance rather than a scroll.
 */
export function renderNotesPanel(options: NotesPanelOptions): NotesPanelHandle {
  const { doc } = options;

  const element = doc.createElement("div");
  element.className = "awesomeado-notes";
  element.style.cssText = [
    "display:none",
    "margin-top:4px",
    // Aligns the notes under the row's content block rather than under its tree gutter.
    "padding-left:39px",
    "color:var(--text-primary-color, #323130)",
  ].join(";");

  const state: PanelState = { notes: [], currentUser: null, loaded: false, expanded: false };

  const list = doc.createElement("div");
  list.className = "awesomeado-notes__list";

  const composer = renderNoteComposer(doc, {
    onSubmit: (text) => submitNote(options, state, null, text).then((ok) => finish(ok, render)),
  });

  const render = (): void => {
    list.replaceChildren(...renderRows(options, state, render));
    // Only ever reported from a SUCCESSFUL read: after a failure the count is unknown, and calling
    // this with 0 would grey out an item whose discussion nobody managed to read.
    if (state.error === undefined && state.loaded) {
      options.onNoteCountKnown?.(state.notes.length);
    }
  };

  element.append(composer, list);

  const setExpanded = (expanded: boolean): void => {
    if (state.expanded === expanded) {
      // Only a real flip is acted on (and logged): the board repaints often, and a panel told again
      // what it already is would both refire the fetch and flood the bounded diagnostics log.
      return;
    }
    state.expanded = expanded;
    element.style.display = expanded ? "block" : "none";
    const fetching = expanded && !state.loaded;
    options.logger.info(
      `Notes panel for work item ${options.workItemId} ${expanded ? "expanded" : "collapsed"}: ` +
        `fetching=${fetching}, cachedNotes=${state.notes.length}.`,
    );
    if (fetching) {
      state.loaded = true;
      showStatus(doc, list, "Loading notes…");
      void loadNotes(options, state).then(render);
    }
  };

  return { element, setExpanded, isExpanded: () => state.expanded };
}

/** What the panel knows between renders. */
interface PanelState {
  notes: WorkItemNote[];
  currentUser: NoteAuthor | null;
  /** Whether the fetch has been started; a second expand must not refire it. */
  loaded: boolean;
  expanded: boolean;
  /** Why the fetch failed, so the panel can say so instead of claiming there is nothing to read. */
  error?: string;
}

/** The rows an expanded panel shows: the last two days of notes, or a single explanatory line. */
function renderRows(
  options: NotesPanelOptions,
  state: PanelState,
  rerender: () => void,
): HTMLElement[] {
  const { doc } = options;
  if (state.error !== undefined) {
    return [statusLine(doc, "Could not load notes.")];
  }
  const visible = selectRecentNoteDays(state.notes);
  if (visible.length === 0) {
    return [statusLine(doc, "No notes in this window.")];
  }
  return visible.map((note) =>
    renderNoteRow(doc, {
      note,
      currentUser: state.currentUser,
      mentionNames: options.mentionDirectory.knownNames(),
      onEdit: (text) =>
        submitNote(options, state, note.id, text).then((ok) => finish(ok, rerender)),
    }),
  );
}

/**
 * Post or rewrite a note and fold the result into the panel's own copy.
 *
 * Persist-then-reflect, like every other editable control on this board: the list is only changed
 * once ADO has accepted the write, so a rejected save never leaves a note on screen that was never
 * stored. A save ADO accepted but returned unparseably still counts — the note IS saved, and the
 * panel is refetched on the next open rather than being told a stored note failed.
 */
async function submitNote(
  options: NotesPanelOptions,
  state: PanelState,
  noteId: number | null,
  text: string,
): Promise<boolean> {
  const request = { workItemId: options.workItemId, text };
  const result =
    noteId === null
      ? await options.writer.addNote(request)
      : await options.writer.editNote({ ...request, noteId });
  if (!result.ok) {
    return false;
  }
  if (result.note !== undefined) {
    state.notes = sortNotesNewestFirst([
      ...state.notes.filter((note) => note.id !== result.note?.id),
      result.note,
    ]);
    // A note Azure DevOps has just stored is handed back WITHOUT its rendering, so the row renders
    // from the raw source — where a mention is still a bare GUID. Resolved before the list repaints,
    // or the mention an author just typed would be the one anonymous name on the board.
    await resolveMentionsIn(options.mentionDirectory, [result.note.text, result.note.renderedHtml]);
  } else {
    // ADO stored it but did not describe it back; drop the cache so the next open refetches rather
    // than showing a list that is quietly one note short.
    state.loaded = false;
  }
  return true;
}

/** Re-render after a successful write and report the outcome back to the editor. */
function finish(ok: boolean, rerender: () => void): boolean {
  if (ok) {
    rerender();
  }
  return ok;
}

/** Read the item's notes into the panel's state; a failure is recorded, never thrown at the row. */
async function loadNotes(options: NotesPanelOptions, state: PanelState): Promise<void> {
  const result = await options.loader.loadNotes({
    workItemId: options.workItemId,
    sinceIso: options.sinceIso,
  });
  state.notes = sortNotesNewestFirst(result.notes);
  state.currentUser = result.currentUser;
  state.error = result.error ?? undefined;
  if (result.error !== null) {
    // A failed fetch must not be remembered as "already loaded", or the panel would stay broken for
    // the rest of the session even after the network recovered.
    state.loaded = false;
  }
  // Awaited before the rows are built, not after: a row renders synchronously, so a name that
  // arrives later would leave the mention showing its placeholder until something else repainted
  // the panel. Both encodings are collected — the stored Markdown AND ADO's own rendering — because
  // a note whose `renderedText` ADO omitted falls back to the raw source and its bare GUIDs.
  await resolveMentionsIn(
    options.mentionDirectory,
    state.notes.flatMap((note) => [note.text, note.renderedHtml]),
  );
}

/** Replace the list with a single muted line (loading, empty, or failed). */
function showStatus(doc: Document, list: HTMLElement, message: string): void {
  list.replaceChildren(statusLine(doc, message));
}

/** One muted line standing in for the list. */
function statusLine(doc: Document, message: string): HTMLElement {
  const line = doc.createElement("div");
  line.className = "awesomeado-notes__status";
  line.textContent = message;
  line.style.cssText = ["font-size:11px", "opacity:0.65", "padding:2px 0"].join(";");
  return line;
}
