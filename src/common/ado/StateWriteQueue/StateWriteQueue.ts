import type { ILogger } from "../../logging/ILogger";
import type { WorkItemStateWriteRequest, WorkItemStateWriteResult } from "../IWorkItemStateWriter";

/**
 * Persists a single state change. The queue calls this one request at a time so writes never race
 * on `System.Rev` (see ADR-030). Kept as a function type so the queue depends on the abstraction
 * (Dependency Inversion) rather than a concrete `IWorkItemStateWriter`.
 */
export type WriteState = (request: WorkItemStateWriteRequest) => Promise<WorkItemStateWriteResult>;

/**
 * A strictly-sequential queue for work-item state writes.
 *
 * ADO writes are latency-bound and rule-driven; firing them concurrently would race on `System.Rev`
 * and let a stale rev clobber a fresh one. Enqueuing serializes every write so each observes the
 * previous one's committed rev, keeping ordering deterministic. A rejected write never stalls the
 * chain — the next queued write still runs — so one failure cannot wedge the board.
 */
export class StateWriteQueue {
  // Tail of the serial chain: each enqueue chains onto it, and the next write waits for it to
  // settle. Reset to a settled promise after a failure so a rejection never blocks later writes.
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly writeState: WriteState,
    private readonly logger: ILogger,
  ) {}

  /**
   * Appends a state write to the serial queue and resolves with its result. The returned promise
   * always resolves (never rejects) so an optimistic caller can reconcile on both success and
   * failure without a `catch`.
   */
  enqueue(request: WorkItemStateWriteRequest): Promise<WorkItemStateWriteResult> {
    this.logger.info(
      `Queued state write for item ${request.id} → "${request.state}" (base rev ${request.rev})`,
    );

    const run = this.tail.then(() => this.perform(request));
    // Keep the chain alive regardless of this write's outcome so ordering survives a failure.
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async perform(request: WorkItemStateWriteRequest): Promise<WorkItemStateWriteResult> {
    try {
      const result = await this.writeState(request);
      if (!result.ok) {
        this.logger.error(
          `State write for item ${request.id} → "${request.state}" failed`,
          result.error ?? "Unknown error",
        );
      }
      return result;
    } catch (error: unknown) {
      // writeState resolves with ok:false by contract, but guard the queue so a thrown value can
      // never break the serial chain or the caller's optimistic reconciliation.
      this.logger.error(`State write for item ${request.id} threw`, error);
      return { ok: false, error: "State write threw" };
    }
  }
}
