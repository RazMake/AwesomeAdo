/**
 * Answers "did this item gain a discussion note recently?" for the board's **New notes** pill.
 *
 * The tree cannot answer it: Azure DevOps reports only `System.CommentCount`, a running TOTAL with
 * no dates on it, so an item that was talked about a year ago is indistinguishable from one that was
 * talked about an hour ago. The only source of truth is the discussions themselves — so this reads
 * the DATE of each item's newest comment through `INoteActivityReader`, which asks about the whole
 * board in ONE credentialed round-trip.
 *
 * Three properties, and each is the answer to a way this was slow:
 *
 * - **One read for the board, not one per item.** Asking through the per-item notes loader meant an
 *   injected script and a worker round-trip each time, which is what made the first click on the
 *   pill a visible wait.
 * - **Session-scoped, not board-scoped.** A refresh replaces the board, and an index that went with
 *   it would hand every read straight back to the reader as another wait.
 * - **A timestamp, not a yes/no.** A boolean answer silently rots as the rolling window slides
 *   forward, whereas a timestamp can be re-tested against any later window, so an item correctly
 *   ages out of "newly commented" without being re-read.
 *
 * A recorded answer is re-read only when the item's comment count has moved, which is what makes a
 * refresh cheap: the tree read already brings the fresh count, so an untouched discussion is skipped
 * and only the ones that actually changed cost anything.
 */

import type { INoteActivityReader } from "../../../../common/ado/INoteActivityReader";
import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import type { ILogger } from "../../../../common/logging/ILogger";

/** What one read established about an item's discussion. */
interface KnownDiscussion {
  /**
   * The item's comment count at the moment it was read. A LATER count that differs is the signal
   * that this answer is out of date — the only cheap one Azure DevOps gives, since it ships no
   * "last commented" date on the work item.
   */
  noteCount: number;
  /**
   * Epoch milliseconds of the newest comment, or `-Infinity` when the item has none.
   *
   * Stored instead of a boolean so the answer survives the window sliding forward: an item whose
   * newest comment was 23 hours ago is "newly commented" now and is not an hour from now, and
   * nothing has to be re-read for the board to get that right.
   */
  newestNoteAt: number;
}

/** The remembered answer to "which items were talked about inside the recent-changes window?". */
export class RecentNotesIndex {
  /** What each successfully-read discussion established. */
  private readonly known = new Map<number, KnownDiscussion>();

  /**
   * The count an item carried when its read FAILED. Kept so a failure is not retried on every
   * repaint, while a later count change still earns it another try.
   */
  private readonly failures = new Map<number, number>();

  private reading = false;

  /** Resolvers handed out by `whenSettled`, released together when a read lands. */
  private settleWaiters: (() => void)[] = [];

  constructor(
    private readonly reader: INoteActivityReader,
    private readonly logger: ILogger,
    private readonly excludedPrefixes: readonly string[] = [],
  ) {}

  /** True while the board's discussions are being read, so the pill can say the answer is not in. */
  isPending(): boolean {
    return this.reading;
  }

  /**
   * Resolves once the read in flight has landed. Resolves immediately when there is none, and never
   * rejects: a caller is asking when the reading stopped, not whether it worked.
   */
  whenSettled(): Promise<void> {
    if (!this.reading) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.settleWaiters.push(resolve);
    });
  }

  /**
   * Whether the item is KNOWN to have gained a comment at or after `sinceMs`. An item that has not
   * been read, or whose read failed, answers `false`: the board must not claim activity it never
   * confirmed.
   */
  hasRecentNote(item: TrackedWorkItem, sinceMs: number): boolean {
    const answer = this.known.get(item.id);
    return answer !== undefined && answer.newestNoteAt >= sinceMs;
  }

  /** Drop answers for items no longer present after a manual tree refresh. */
  retain(workItemIds: ReadonlySet<number>): void {
    for (const workItemId of this.known.keys()) {
      if (!workItemIds.has(workItemId)) this.known.delete(workItemId);
    }
    for (const workItemId of this.failures.keys()) {
      if (!workItemIds.has(workItemId)) this.failures.delete(workItemId);
    }
  }

  /**
   * Read the newest-comment date of every item under `root` whose answer is missing or out of date,
   * and skip the rest. Safe to call on every repaint — it is a no-op once the board is covered.
   *
   * Items ADO reports no comments for are skipped outright rather than asked about and found empty:
   * that is the difference between a small request and one per row on a board where most items have
   * never been commented on.
   */
  ensureProbed(root: TrackedWorkItem): void {
    if (this.reading) {
      // A second pass while the first is in flight would re-ask for everything it has not recorded
      // yet. The pass that lands re-checks the tree, so nothing is missed by waiting.
      return;
    }
    const stale = descendantsOf(root).filter(
      (item) => item.noteCount > 0 && this.needsReading(item),
    );
    if (stale.length === 0) {
      return;
    }
    // A rare, user-driven read of a board's discussions: worth one line naming what it cost and what
    // it reused, so an unexpected burst of ADO traffic — or the absence of one after a refresh — is
    // explainable from the log alone.
    this.logger.info(
      `New notes filter: reading ${stale.length} discussion date(s); ` +
        `${this.known.size} already known and still current.`,
    );
    this.reading = true;
    void this.read(stale).finally(() => {
      this.reading = false;
      this.reportSettled();
    });
  }

  /**
   * Is this item's answer missing or stale?
   *
   * The comment count is the whole test. It is the only per-item signal the tree carries about the
   * discussion, so a count that has not moved means no comment was added — and the recorded answer,
   * being a timestamp rather than a yes/no, is still true against today's window. (A comment added
   * and deleted between two reads would leave the count equal and go unseen; it is self-correcting
   * on the next change, and not worth re-reading the whole board on every refresh to catch.)
   */
  private needsReading(item: TrackedWorkItem): boolean {
    const seen = this.known.get(item.id)?.noteCount ?? this.failures.get(item.id);
    return seen !== item.noteCount;
  }

  /** Runs the bulk read and records only what the response actually established. */
  private async read(stale: TrackedWorkItem[]): Promise<void> {
    // Captured BEFORE the await: a notes panel opening meanwhile rewrites `item.noteCount` to the
    // in-window count, and recording that against this answer would invalidate it on the next pass.
    const counts = new Map(stale.map((item) => [item.id, item.noteCount]));
    try {
      const result = await this.reader.readNoteActivity({
        workItemIds: [...counts.keys()],
        excludedPrefixes: [...this.excludedPrefixes],
      });
      const answered = new Set<number>();
      for (const entry of result.activity) {
        const noteCount = counts.get(entry.workItemId);
        if (noteCount === undefined) {
          continue;
        }
        answered.add(entry.workItemId);
        this.failures.delete(entry.workItemId);
        this.known.set(entry.workItemId, {
          noteCount,
          newestNoteAt: epochOf(entry.newestNoteDate),
        });
      }
      // Anything the reader did not answer for is recorded as a failure, so it is neither claimed as
      // "nobody commented" nor re-asked on every repaint.
      this.recordUnanswered(counts, answered, result.error);
    } catch (error) {
      for (const [workItemId, noteCount] of counts) {
        this.failures.set(workItemId, noteCount);
      }
      this.logger.error(
        "New notes filter: reading the board's discussion dates threw. Those items will not be " +
          "shown as newly commented.",
        error,
      );
    }
  }

  /** Marks the items the read did not answer for, and says why once rather than per item. */
  private recordUnanswered(
    counts: ReadonlyMap<number, number>,
    answered: ReadonlySet<number>,
    error: string | null,
  ): void {
    let lost = 0;
    for (const [workItemId, noteCount] of counts) {
      if (!answered.has(workItemId)) {
        this.failures.set(workItemId, noteCount);
        lost++;
      }
    }
    if (lost > 0) {
      this.logger.error(
        `New notes filter: ${lost} discussion date(s) could not be read — ${error ?? "no reason given"}. ` +
          "Those items will not be shown as newly commented.",
      );
    }
  }

  /** One summary per settle, not one line per item: the diagnostics log is a bounded ring buffer. */
  private reportSettled(): void {
    this.logger.info(
      `New notes filter settled: known=${this.known.size}, failed=${this.failures.size}.`,
    );
    const waiters = this.settleWaiters;
    this.settleWaiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }
}

/**
 * An ISO timestamp as epoch milliseconds, or `-Infinity` when there is none (or it cannot be dated).
 * `-Infinity` is deliberate rather than `null`: it compares correctly against every window start, so
 * the caller never has to special-case "nothing here".
 */
function epochOf(iso: string | null): number {
  if (iso === null) {
    return Number.NEGATIVE_INFINITY;
  }
  const at = Date.parse(iso);
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
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
