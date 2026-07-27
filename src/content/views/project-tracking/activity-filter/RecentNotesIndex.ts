/**
 * Answers "did this item gain a discussion note recently?" for the board's **New notes** pill.
 *
 * The tree cannot answer it: Azure DevOps reports only `System.CommentCount`, a running TOTAL with
 * no dates on it, so an item that was talked about a year ago is indistinguishable from one that was
 * talked about an hour ago. The only source of truth is each item's discussion, which is why this
 * exists at all — and why it reads them **on demand**, when the reader lights the pill, rather than
 * with the board: a tracking board routinely shows dozens of items, and reading every discussion up
 * front would fire dozens of requests for a filter nobody asked for.
 *
 * Each item is read at most once per board. A refresh builds a new board, and therefore a new index,
 * which is what makes the ⟳ button the way to re-ask the question.
 */

import type { IWorkItemNoteLoader } from "../../../../common/ado/IWorkItemNoteLoader";
import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import type { ILogger } from "../../../../common/logging/ILogger";

/**
 * How many discussions are read at once.
 *
 * Every read is a credentialed round-trip to Azure DevOps routed through the service worker, so
 * releasing a whole board's worth at once would both queue behind itself and compete with the writes
 * and note panels sharing that channel. Small enough to stay polite, large enough that a board of a
 * few dozen items settles in a handful of round-trip times.
 */
const MAX_CONCURRENT_DISCUSSION_READS = 6;

/** The lazily-built answer to "which items were talked about inside the recent-changes window?". */
export class RecentNotesIndex {
  /** Items known to carry at least one note inside the window that was probed. */
  private readonly withRecentNote = new Set<number>();

  /** Items already read (or being read) — the guard that keeps each discussion to a single fetch. */
  private readonly probed = new Set<number>();

  /** Items whose read failed. Kept out of `withRecentNote` so a failure never invents activity. */
  private readonly failed = new Set<number>();

  private readonly waiting: number[] = [];

  private inFlight = 0;

  /** The window the recorded answers are pinned to; empty until the first probe. */
  private probedSinceIso = "";

  /**
   * @param onSettled Called once each time the index goes from reading to idle, so the board can
   * repaint with the completed answer instead of flickering per item as reads land.
   */
  constructor(
    private readonly loader: IWorkItemNoteLoader,
    private readonly logger: ILogger,
    private readonly onSettled: () => void,
  ) {}

  /** True while discussions are still being read, so the pill can say the answer is not in yet. */
  isPending(): boolean {
    return this.inFlight > 0 || this.waiting.length > 0;
  }

  /**
   * Whether the item is KNOWN to have gained a note inside the probed window. An item that has not
   * been read, or whose read failed, answers `false`: the board must not claim activity it never
   * confirmed.
   */
  hasRecentNote(item: TrackedWorkItem): boolean {
    return this.withRecentNote.has(item.id);
  }

  /**
   * Read the discussions of every item under `root` that could carry a recent note, skipping those
   * already read. Safe to call on every repaint — it is a no-op once the tree has been covered.
   *
   * Items ADO reports no comments for are skipped outright rather than read and found empty: that is
   * the difference between a handful of requests and one per row on a board where most items have
   * never been commented on.
   */
  ensureProbed(root: TrackedWorkItem, sinceIso: string): void {
    // Pinned to the FIRST probe: "now" advances on every repaint, and re-reading each discussion
    // because the window slid by a few seconds would turn a one-off cost into a permanent one.
    if (this.probedSinceIso === "") {
      this.probedSinceIso = sinceIso;
    }

    const queued: number[] = [];
    for (const item of descendantsOf(root)) {
      if (item.noteCount > 0 && !this.probed.has(item.id)) {
        this.probed.add(item.id);
        this.waiting.push(item.id);
        queued.push(item.id);
      }
    }
    if (queued.length === 0) {
      return;
    }
    // A rare, user-driven read of a whole board's discussions: worth one line naming what triggered
    // it and how much it cost, so an unexpected burst of ADO traffic is explainable from the log.
    this.logger.info(
      `New notes filter: reading ${queued.length} discussion(s) since ${this.probedSinceIso} ` +
        `(already known: ${this.probed.size - queued.length}).`,
    );
    this.pump();
  }

  /** Starts as many reads as the concurrency budget allows, then lets each completion start more. */
  private pump(): void {
    while (this.inFlight < MAX_CONCURRENT_DISCUSSION_READS && this.waiting.length > 0) {
      const workItemId = this.waiting.shift();
      if (workItemId === undefined) {
        return;
      }
      this.inFlight++;
      void this.read(workItemId).finally(() => {
        this.inFlight--;
        if (this.isPending()) {
          this.pump();
        } else {
          this.reportSettled();
        }
      });
    }
  }

  /** Reads one item's discussion, recording only what the response actually established. */
  private async read(workItemId: number): Promise<void> {
    try {
      const result = await this.loader.loadNotes({
        workItemId,
        sinceIso: this.probedSinceIso,
      });
      if (result.error !== null) {
        this.failed.add(workItemId);
        this.logger.error(
          `New notes filter: couldn't read work item ${workItemId}'s discussion — ${result.error}. ` +
            "It will not be shown as newly commented.",
        );
        return;
      }
      // The loader already drops anything older than the window, so a non-empty list IS the answer.
      if (result.notes.length > 0) {
        this.withRecentNote.add(workItemId);
      }
    } catch (error) {
      this.failed.add(workItemId);
      this.logger.error(
        `New notes filter: reading work item ${workItemId}'s discussion threw. ` +
          "It will not be shown as newly commented.",
        error,
      );
    }
  }

  /** One summary per settle, not one line per item: the diagnostics log is a bounded ring buffer. */
  private reportSettled(): void {
    this.logger.info(
      `New notes filter settled: probed=${this.probed.size}, ` +
        `withRecentNote=${this.withRecentNote.size}, failed=${this.failed.size}.`,
    );
    this.onSettled();
  }
}

/** Every item beneath `root`, excluding the root itself — the board never renders it as a row. */
function descendantsOf(root: TrackedWorkItem): TrackedWorkItem[] {
  const collected: TrackedWorkItem[] = [];
  const pending = [...root.children];
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) {
      break;
    }
    collected.push(item);
    pending.push(...item.children);
  }
  return collected;
}
