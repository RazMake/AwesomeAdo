import type { ILogger } from "../../logging/ILogger";
import type { WorkItemFieldWriteRequest, WorkItemFieldWriteResult } from "../IWorkItemFieldWriter";

/**
 * Persists a single field change. The queue calls this one request at a time so writes never race
 * on `System.Rev` (see ADR-030). Kept as a function type so the queue depends on the abstraction
 * (Dependency Inversion) rather than a concrete `IWorkItemFieldWriter`.
 */
export type WriteField = (request: WorkItemFieldWriteRequest) => Promise<WorkItemFieldWriteResult>;

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
 * A strictly-sequential queue for work-item field writes.
 *
 * ADO writes are latency-bound and rule-driven; firing them concurrently would race on `System.Rev`
 * and let a stale rev clobber a fresh one. Enqueuing serializes every write, and each write reads
 * the item's rev only once the previous one has settled, so a burst of edits to one item does not
 * turn into a burst of stale-rev rejections. A rejected write never stalls the chain — the next
 * queued write still runs — so one failure cannot wedge the board.
 */
export class FieldWriteQueue {
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
  private readonly failureListeners = new Set<(count: number) => void>();

  constructor(
    private readonly writeField: WriteField,
    private readonly logger: ILogger,
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
   * Fires immediately with the current count, then again after every failure. Returns an
   * unsubscribe function.
   */
  onWriteFailed(listener: (count: number) => void): () => void {
    this.failureListeners.add(listener);
    // Fire once now so a fresh subscriber reflects the current state without waiting for a change.
    this.notifyOne(listener, this.failed, "Failed-count listener threw");
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

    // Count it as pending the instant it is queued, before it starts running, so the UI reflects
    // waiting writes and not just the one in flight.
    this.pending += 1;
    this.notifyAll();

    const run = this.tail.then(() => this.perform(request));
    // Keep the chain alive regardless of this write's outcome so ordering survives a failure.
    this.tail = run.catch(() => undefined);
    // Decrement on settlement via `finally` so success and failure both release the slot exactly
    // once; `run` never rejects by contract, but `finally` is robust either way.
    void run.finally(() => {
      this.pending -= 1;
      this.notifyAll();
    });
    return run;
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
      this.notifyOne(listener, this.failed, "Failed-count listener threw");
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

  private recordFailure(): void {
    this.failed += 1;
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
        this.recordFailure();
      }
      return result;
    } catch (error: unknown) {
      // writeField resolves with ok:false by contract, but guard the queue so a thrown value can
      // never break the serial chain or the caller's optimistic reconciliation.
      this.logger.error(`Field write for item ${request.id} threw`, error);
      this.recordFailure();
      return { ok: false, error: "Field write threw" };
    }
  }
}
