import type { ILogger } from "../../logging/ILogger";
import type { WorkItemFieldWriteRequest, WorkItemFieldWriteResult } from "../IWorkItemFieldWriter";
import type { WorkItemReorderRequest, WorkItemReorderResult } from "../IWorkItemReorderWriter";

/**
 * Persists a single field change. The queue calls this one request at a time so writes never race
 * on `System.Rev` (see ADR-030). Kept as a function type so the queue depends on the abstraction
 * (Dependency Inversion) rather than a concrete `IWorkItemFieldWriter`.
 */
export type WriteField = (request: WorkItemFieldWriteRequest) => Promise<WorkItemFieldWriteResult>;

/**
 * Moves a single work item. Kept as a function type for the same reason as `WriteField`, and taken
 * separately so a board that never reorders is not forced to supply one.
 */
export type ReorderItem = (request: WorkItemReorderRequest) => Promise<WorkItemReorderResult>;

/**
 * A field write as the QUEUE takes it, which differs from `WorkItemFieldWriteRequest` in one
 * deliberate way: the rev is a *resolver*, not a value.
 *
 * ADO rejects a patch whose `/rev` test does not match, so a queued write must carry the rev the
 * item has when the write actually RUNS, not the one it had when the user clicked. Reading the rev
 * at enqueue time silently loses the second of two quick edits to the same item, because the first
 * write commits a new rev in between. Taking a resolver keeps the item itself the single owner of
 * its rev (no shadow copy inside the queue to drift) while still binding late.
 */
export interface QueuedFieldWrite {
  /** The work item id whose field to change. */
  id: number;
  /** Reads the item's CURRENT `System.Rev`; called once, immediately before the write is sent. */
  currentRev: () => number;
  /** The ADO field reference name to write (e.g. `System.State` or a type's ETA date field). */
  field: string;
  /** The value to set; `null` clears the field. */
  value: string | null;
}

/**
 * A move as the QUEUE takes it: like `QueuedFieldWrite`, the rev is a *resolver* rather than a value,
 * for exactly the same reason — a re-parent patches the item under a `/rev` test, so it must carry
 * the rev the item has when the move RUNS, not the one it had when the user dropped it.
 */
export interface QueuedReorder extends Omit<WorkItemReorderRequest, "rev"> {
  /** Reads the item's CURRENT `System.Rev`; called once, immediately before the move is sent. */
  currentRev: () => number;
}

/**
 * Notified when a queued write is rejected: how many have failed, and why the latest one did.
 *
 * The reason travels with the count because on a persist-then-reflect board nothing on screen
 * changes when a write is lost — so a bare count tells the user only that something went wrong, and
 * leaves the log as the sole place to find out what.
 */
export type FailureListener = (count: number, lastError?: string) => void;

/**
 * A strictly-sequential queue for work-item writes.
 *
 * ADO writes are latency-bound and rule-driven; firing them concurrently would race on `System.Rev`
 * and let a stale rev clobber a fresh one. Enqueuing serializes every write, and each one reads
 * the item's rev only once the previous has settled, so a burst of edits to one item does not
 * turn into a burst of stale-rev rejections. A rejected write never stalls the chain — the next
 * queued write still runs — so one failure cannot wedge the board.
 *
 * Field edits and drag-reorders share ONE queue rather than getting one each: a re-parent patches
 * the same item under the same `/rev` test a field write does, so two queues would race precisely
 * where serialization matters most.
 */
export class WorkItemWriteQueue {
  // Tail of the serial chain: each enqueue chains onto it, and the next write waits for it to
  // settle. Reset to a settled promise after a failure so a rejection never blocks later writes.
  private tail: Promise<unknown> = Promise.resolve();

  // Writes queued but not yet settled (the one running plus those still waiting). Surfaced live so
  // a UI control can show in-flight writes without polling.
  private pending = 0;

  // Writes that have failed since the queue was created. A failed write is otherwise invisible to
  // the user — the control it came from is persist-then-reflect, so nothing on screen changes — so
  // this is the only channel that can tell "rejected" apart from "still saving".
  private failed = 0;

  // Held in a Set so subscribe/unsubscribe are O(1) and a listener can never be added twice.
  private readonly listeners = new Set<(count: number) => void>();

  // Kept separate from `listeners` rather than widening the pending-count callback: a subscriber
  // that only renders "saving" must not be forced to reason about failures (Interface Segregation).
  private readonly failureListeners = new Set<FailureListener>();

  // Why the most recent write was rejected. Carried alongside the count so a UI can show the actual
  // cause instead of only "something failed" — which, on a persist-then-reflect board where nothing
  // on screen changes, is the difference between an actionable report and a dead end.
  private lastFailure: string | undefined;

  constructor(
    private readonly writeField: WriteField,
    private readonly logger: ILogger,
    private readonly reorderItem: ReorderItem = () =>
      Promise.resolve({ ok: false, error: "reordering is not available" }),
  ) {}

  /** The number of writes queued but not yet settled (the one running plus those still waiting). */
  get pendingCount(): number {
    return this.pending;
  }

  /** The number of writes that have failed since this queue was created. */
  get failedCount(): number {
    return this.failed;
  }

  /**
   * Subscribes to pending-count changes so a UI can reflect in-flight writes. The listener fires
   * immediately with the current count on subscribe, then again whenever the count changes (each
   * enqueue increments; each write settling — success OR failure — decrements). Returns an
   * unsubscribe function; call it to stop receiving updates.
   */
  onPendingChange(listener: (count: number) => void): () => void {
    this.listeners.add(listener);
    // Fire once now so a fresh subscriber reflects the current state without waiting for a change.
    this.notify(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Subscribes to the failed-write count so a UI can tell a rejected save apart from a slow one.
   * Fires immediately with the current count, then again after every failure, each time with the
   * reason the latest write was rejected (undefined when nothing has failed yet). Returns an
   * unsubscribe function.
   */
  onWriteFailed(listener: FailureListener): () => void {
    this.failureListeners.add(listener);
    // Fire once now so a fresh subscriber reflects the current state without waiting for a change.
    this.notifyFailureListener(listener);
    return () => {
      this.failureListeners.delete(listener);
    };
  }

  /**
   * Appends a field write to the serial queue and resolves with its result. The returned promise
   * always resolves (never rejects) so an optimistic caller can reconcile on both success and
   * failure without a `catch`.
   */
  enqueue(request: QueuedFieldWrite): Promise<WorkItemFieldWriteResult> {
    this.logger.info(`Queued field write for item ${request.id} → "${request.field}"`);
    return this.append(() => this.perform(request));
  }

  /**
   * Appends a move to the same serial queue and resolves with its result. Like `enqueue`, the
   * returned promise always resolves (never rejects) so an optimistic caller can reconcile on both
   * success and failure without a `catch`.
   */
  enqueueReorder(request: QueuedReorder): Promise<WorkItemReorderResult> {
    this.logger.info(
      `Queued move for item ${request.id} → parent ${request.parentId} ` +
        `(was ${request.currentParentId}), between ${request.previousId} and ${request.nextId}`,
    );
    return this.append(() => this.performReorder(request));
  }

  /**
   * Chains one operation onto the serial tail and keeps the pending count honest.
   *
   * Shared by both entry points so "counted as pending the instant it is queued", "the chain
   * survives a failure" and "the slot is released exactly once" are stated once rather than
   * duplicated per operation kind — the invariants are the queue's, not any one operation's.
   */
  private append<T>(run: () => Promise<T>): Promise<T> {
    // Count it as pending the instant it is queued, before it starts running, so the UI reflects
    // waiting writes and not just the one in flight.
    this.pending += 1;
    this.notifyAll();

    const settled = this.tail.then(run);
    // Keep the chain alive regardless of this operation's outcome so ordering survives a failure.
    this.tail = settled.catch(() => undefined);
    // Decrement on settlement via `finally` so success and failure both release the slot exactly
    // once; `settled` never rejects by contract, but `finally` is robust either way.
    void settled.finally(() => {
      this.pending -= 1;
      this.notifyAll();
    });
    return settled;
  }

  private notifyAll(): void {
    for (const listener of this.listeners) {
      this.notifyOne(listener, this.pending, "Pending-count listener threw");
    }
  }

  private notify(listener: (count: number) => void): void {
    this.notifyOne(listener, this.pending, "Pending-count listener threw");
  }

  private notifyFailure(): void {
    for (const listener of this.failureListeners) {
      this.notifyFailureListener(listener);
    }
  }

  private notifyFailureListener(listener: FailureListener): void {
    try {
      listener(this.failed, this.lastFailure);
    } catch (error: unknown) {
      // A listener is UI code; isolate its failure so one buggy subscriber can never wedge the
      // queue or starve the other listeners of updates.
      this.logger.error("Failed-count listener threw", error);
    }
  }

  private notifyOne(listener: (count: number) => void, count: number, onThrow: string): void {
    try {
      listener(count);
    } catch (error: unknown) {
      // A listener is UI code; isolate its failure so one buggy subscriber can never wedge the
      // queue or starve the other listeners of updates.
      this.logger.error(onThrow, error);
    }
  }

  private recordFailure(reason?: string): void {
    this.failed += 1;
    this.lastFailure = reason !== undefined && reason.length > 0 ? reason : "Unknown error";
    this.notifyFailure();
  }

  private async perform(queued: QueuedFieldWrite): Promise<WorkItemFieldWriteResult> {
    // Bind the rev HERE, not at enqueue: the previous write in the chain has already settled and
    // committed its new rev onto the item, so this is the only point at which the value is current.
    const request: WorkItemFieldWriteRequest = {
      id: queued.id,
      rev: queued.currentRev(),
      field: queued.field,
      value: queued.value,
    };
    try {
      const result = await this.writeField(request);
      if (!result.ok) {
        this.logger.error(
          `Field write for item ${request.id} → "${request.field}" failed (base rev ${request.rev})`,
          result.error ?? "Unknown error",
        );
        this.recordFailure(result.error);
      }
      return result;
    } catch (error: unknown) {
      // writeField resolves with ok:false by contract, but guard the queue so a thrown value can
      // never break the serial chain or the caller's optimistic reconciliation.
      this.logger.error(`Field write for item ${request.id} threw`, error);
      this.recordFailure("Field write threw");
      return { ok: false, error: "Field write threw" };
    }
  }

  private async performReorder(queued: QueuedReorder): Promise<WorkItemReorderResult> {
    // Bind the rev HERE, not at enqueue, for the same reason `perform` does: the previous operation
    // in the chain has already committed its new rev onto the item.
    const { currentRev, ...rest } = queued;
    const request: WorkItemReorderRequest = { ...rest, rev: currentRev() };
    try {
      const result = await this.reorderItem(request);
      if (!result.ok) {
        this.logger.error(
          `Move of item ${request.id} to parent ${request.parentId} failed (base rev ${request.rev})`,
          result.error ?? "Unknown error",
        );
        this.recordFailure(result.error);
      }
      return result;
    } catch (error: unknown) {
      // reorderItem resolves with ok:false by contract, but guard the queue so a thrown value can
      // never break the serial chain or the caller's optimistic reconciliation.
      this.logger.error(`Move of item ${request.id} threw`, error);
      this.recordFailure("Move threw");
      return { ok: false, error: "Move threw" };
    }
  }
}
