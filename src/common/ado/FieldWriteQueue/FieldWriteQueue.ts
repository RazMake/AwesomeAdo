import type { ILogger } from "../../logging/ILogger";
import type { WorkItemFieldWriteRequest, WorkItemFieldWriteResult } from "../IWorkItemFieldWriter";

/**
 * Persists a single field change. The queue calls this one request at a time so writes never race
 * on `System.Rev` (see ADR-030). Kept as a function type so the queue depends on the abstraction
 * (Dependency Inversion) rather than a concrete `IWorkItemFieldWriter`.
 */
export type WriteField = (request: WorkItemFieldWriteRequest) => Promise<WorkItemFieldWriteResult>;

/**
 * A strictly-sequential queue for work-item field writes.
 *
 * ADO writes are latency-bound and rule-driven; firing them concurrently would race on `System.Rev`
 * and let a stale rev clobber a fresh one. Enqueuing serializes every write so each observes the
 * previous one's committed rev, keeping ordering deterministic. A rejected write never stalls the
 * chain — the next queued write still runs — so one failure cannot wedge the board.
 */
export class FieldWriteQueue {
  // Tail of the serial chain: each enqueue chains onto it, and the next write waits for it to
  // settle. Reset to a settled promise after a failure so a rejection never blocks later writes.
  private tail: Promise<unknown> = Promise.resolve();

  // Writes queued but not yet settled (the one running plus those still waiting). Surfaced live so
  // a UI control can show in-flight writes without polling.
  private pending = 0;

  // Held in a Set so subscribe/unsubscribe are O(1) and a listener can never be added twice.
  private readonly listeners = new Set<(count: number) => void>();

  constructor(
    private readonly writeField: WriteField,
    private readonly logger: ILogger,
  ) {}

  /** The number of writes queued but not yet settled (the one running plus those still waiting). */
  get pendingCount(): number {
    return this.pending;
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
   * Appends a field write to the serial queue and resolves with its result. The returned promise
   * always resolves (never rejects) so an optimistic caller can reconcile on both success and
   * failure without a `catch`.
   */
  enqueue(request: WorkItemFieldWriteRequest): Promise<WorkItemFieldWriteResult> {
    this.logger.info(
      `Queued field write for item ${request.id} → "${request.field}" (base rev ${request.rev})`,
    );

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
      this.notify(listener);
    }
  }

  private notify(listener: (count: number) => void): void {
    try {
      listener(this.pending);
    } catch (error: unknown) {
      // A listener is UI code; isolate its failure so one buggy subscriber can never wedge the
      // queue or starve the other listeners of updates.
      this.logger.error("Pending-count listener threw", error);
    }
  }

  private async perform(request: WorkItemFieldWriteRequest): Promise<WorkItemFieldWriteResult> {
    try {
      const result = await this.writeField(request);
      if (!result.ok) {
        this.logger.error(
          `Field write for item ${request.id} → "${request.field}" failed`,
          result.error ?? "Unknown error",
        );
      }
      return result;
    } catch (error: unknown) {
      // writeField resolves with ok:false by contract, but guard the queue so a thrown value can
      // never break the serial chain or the caller's optimistic reconciliation.
      this.logger.error(`Field write for item ${request.id} threw`, error);
      return { ok: false, error: "Field write threw" };
    }
  }
}
