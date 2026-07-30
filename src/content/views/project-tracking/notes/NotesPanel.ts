import type { IMentionDirectory } from "../../../../common/ado/IMentionDirectory";
import type { IUserDirectory } from "../../../../common/ado/IUserDirectory";
import type { IWorkItemNoteLoader } from "../../../../common/ado/IWorkItemNoteLoader";
import type { IWorkItemNoteWriter } from "../../../../common/ado/IWorkItemNoteWriter";
import type { NoteAuthor, WorkItemNote } from "../../../../common/ado/WorkItemNote";
import { selectRecentNoteDays, sortNotesNewestFirst } from "../../../../common/ado/WorkItemNote";
import { resolveMentionsIn } from "../../../../common/browser/MessagingMentionDirectory";
import type { ILogger } from "../../../../common/logging/ILogger";
import type { WorkItemMarkerTags } from "../../../../common/settings/ExtensionSettings";

import { renderNoteComposer } from "./NoteComposer";
import { renderNoteRow } from "./NoteRow";
import { markerCommentPrefixes, startsWithMarkerComment } from "./markerNotes";

/** The narrow slice of enhanced-view services used by a notes panel. */
export interface NotesPanelServices {
  noteLoader: IWorkItemNoteLoader;
  noteWriter: IWorkItemNoteWriter;
  /**
   * Resolves the identity GUIDs the notes' `@`-mentions are stored as.
   *
   * Asked once per panel load, for every mention across the notes it just fetched — not per note and
   * not per mention. The directory memoizes, so the teammates already named by the board's
   * descriptions cost nothing here.
   */
  mentionDirectory: IMentionDirectory;
  /** Searches identities while an author types an `@` mention. */
  userDirectory: IUserDirectory;
  /** The team's marker comment prefixes; inline panels omit notes beginning with any of them. */
  markerTags(): WorkItemMarkerTags;
  logger: ILogger;
}

/** Everything one item's notes panel needs to fetch, show and author notes. */
export interface NotesPanelOptions {
  doc: Document;
  workItemId: number;
  /** ISO 8601 start of the binding's Updates window; nothing older is fetched or shown. */
  sinceIso: string;
  services: NotesPanelServices;
  /** Data shared by rebuilt panels for the same item, so a board repaint does not refetch it. */
  state?: NotesPanelState;
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
  /**
   * Show EVERY note inside the Updates window instead of only the two most recent days with notes.
   *
   * The two-day rule exists because a panel under a ROW is a glance — dozens of them are on screen at
   * once, and a scroll under each would bury the board. A surface the reader deliberately opened to
   * read one item's discussion is the opposite case: there, cutting the list off at two days hides
   * exactly what they asked for.
   */
  showAllInWindow?: boolean;
  /**
   * Show ONLY the notes beginning with this marker comment prefix, and no composer with them.
   *
   * A surface opened from one marker answers a single question — why is it blocked? — so everything
   * else in the discussion is noise there. It carries no "+ Add note" because a note typed into it
   * would not begin with the prefix, and would therefore vanish from the very list it was written in.
   */
  onlyCommentPrefix?: string;
}

/** A mounted notes panel and the one thing the row that owns it changes about it. */
export interface NotesPanelHandle {
  element: HTMLElement;
  /** Show or hide the panel; the first show is what triggers the fetch. */
  setExpanded(expanded: boolean): void;
  isExpanded(): boolean;
}

/** Note data that outlives one rendered panel while the Project Tracking session remains open. */
export interface NotesPanelState {
  notes: WorkItemNote[];
  currentUser: NoteAuthor | null;
  /** Whether a successful or currently-running fetch has claimed this state. */
  loaded: boolean;
  /** Shared so a replacement panel can await the read its predecessor already started. */
  loading?: Promise<void>;
  /** Why the last fetch failed, so the panel can report it without pretending the list is empty. */
  error?: string;
}

/** Create the session-owned state for one work item's notes panel. */
export function createNotesPanelState(): NotesPanelState {
  return { notes: [], currentUser: null, loaded: false };
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
  const { doc, services } = options;

  const element = doc.createElement("div");
  element.className = "awesomeado-notes";
  element.style.cssText = [
    "display:none",
    "margin-top:4px",
    // Aligns the notes under the row's content block rather than under its tree gutter.
    "padding-left:39px",
    "color:var(--text-primary-color)",
  ].join(";");

  const state = options.state ?? createNotesPanelState();
  let expanded = false;

  const list = doc.createElement("div");
  list.className = "awesomeado-notes__list";

  const composer = renderNoteComposer(doc, {
    mentions: {
      userDirectory: services.userDirectory,
      logger: services.logger,
      mentionNames: services.mentionDirectory.knownNames(),
    },
    onSubmit: (text) => submitNote(options, state, null, text).then((ok) => finish(ok, render)),
  });

  const render = (): void => {
    list.replaceChildren(...renderRows(options, state, render));
    // Only ever reported from a SUCCESSFUL read: after a failure the count is unknown, and calling
    // this with 0 would grey out an item whose discussion nobody managed to read.
    if (state.error === undefined && state.loaded) {
      options.onNoteCountKnown?.(notesForSurface(options, state.notes).length);
    }
  };

  element.append(...(options.onlyCommentPrefix === undefined ? [composer] : []), list);
  const setExpanded = (nextExpanded: boolean): void => {
    if (expanded === nextExpanded) {
      // Only a real flip is acted on (and logged): the board repaints often, and a panel told again
      // what it already is would both refire the fetch and flood the bounded diagnostics log.
      return;
    }
    expanded = nextExpanded;
    element.style.display = expanded ? "block" : "none";
    const fetching = expanded && !state.loaded;
    services.logger.info(
      `Notes panel for work item ${options.workItemId} ${expanded ? "expanded" : "collapsed"}: ` +
        `fetching=${fetching}, cachedNotes=${state.notes.length}.`,
    );
    if (fetching) {
      state.loaded = true;
      showStatus(doc, list, "Loading notes…");
      const loading = state.loading ?? loadNotes(options, state);
      state.loading = loading;
      void loading.then(render).finally(() => {
        if (state.loading === loading) state.loading = undefined;
      });
    } else if (expanded && state.loading !== undefined) {
      showStatus(doc, list, "Loading notes…");
      void state.loading.then(render);
    } else if (expanded) {
      render();
    }
  };

  return { element, setExpanded, isExpanded: () => expanded };
}

/** The rows an expanded panel shows: the notes inside its window, or a single explanatory line. */
function renderRows(
  options: NotesPanelOptions,
  state: NotesPanelState,
  rerender: () => void,
): HTMLElement[] {
  const { doc } = options;
  if (state.error !== undefined) {
    return [statusLine(doc, "Could not load notes.")];
  }
  const notes = notesForSurface(options, state.notes);
  const visible =
    options.showAllInWindow || options.onlyCommentPrefix !== undefined
      ? notes
      : selectRecentNoteDays(notes);
  if (visible.length === 0) {
    return [statusLine(doc, "No notes in this window.")];
  }
  return visible.map((note) =>
    renderNoteRow(doc, {
      note,
      codePrefixes: markerCommentPrefixes(options.services.markerTags()),
      currentUser: state.currentUser,
      mentionNames: options.services.mentionDirectory.knownNames(),
      mentions: {
        userDirectory: options.services.userDirectory,
        logger: options.services.logger,
      },
      onEdit: (text) =>
        submitNote(options, state, note.id, text).then((ok) => finish(ok, rerender)),
    }),
  );
}

/** The notes this surface is allowed to show; the deliberately-full popup bypasses marker filtering. */
function notesForSurface(
  options: NotesPanelOptions,
  notes: readonly WorkItemNote[],
): readonly WorkItemNote[] {
  const only = options.onlyCommentPrefix;
  if (only !== undefined) {
    return notes.filter((note) => note.text.startsWith(only));
  }
  if (options.showAllInWindow) {
    return notes;
  }
  const prefixes = markerCommentPrefixes(options.services.markerTags());
  return notes.filter((note) => !startsWithMarkerComment(note.text, prefixes));
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
  state: NotesPanelState,
  noteId: number | null,
  text: string,
): Promise<boolean> {
  const request = { workItemId: options.workItemId, text };
  const result =
    noteId === null
      ? await options.services.noteWriter.addNote(request)
      : await options.services.noteWriter.editNote({ ...request, noteId });
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
    await resolveMentionsIn(options.services.mentionDirectory, [
      result.note.text,
      result.note.renderedHtml,
    ]);
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
async function loadNotes(options: NotesPanelOptions, state: NotesPanelState): Promise<void> {
  const result = await options.services.noteLoader.loadNotes({
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
    options.services.mentionDirectory,
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
