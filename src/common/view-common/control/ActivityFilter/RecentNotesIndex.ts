import type { INoteActivityReader } from "../../../ado/INoteActivityReader";
import type { TrackedWorkItem } from "../../../ado/TrackedWorkItem";
import type { ILogger } from "../../../logging/ILogger";

interface KnownDiscussion {
  noteCount: number;
  newestNoteAt: number;
}

/** Session-scoped cache of newest discussion dates used by the shared New notes filter. */
export class RecentNotesIndex {
  private readonly known = new Map<number, KnownDiscussion>();
  private readonly failures = new Map<number, number>();
  private reading = false;
  private settleWaiters: (() => void)[] = [];

  constructor(
    private readonly reader: INoteActivityReader,
    private readonly logger: ILogger,
    private readonly excludedPrefixes: readonly string[] = [],
  ) {}

  isPending(): boolean {
    return this.reading;
  }

  whenSettled(): Promise<void> {
    if (!this.reading) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.settleWaiters.push(resolve);
    });
  }

  hasRecentNote(item: TrackedWorkItem, sinceMs: number): boolean {
    const answer = this.known.get(item.id);
    return answer !== undefined && answer.newestNoteAt >= sinceMs;
  }

  retain(workItemIds: ReadonlySet<number>): void {
    for (const workItemId of this.known.keys()) {
      if (!workItemIds.has(workItemId)) this.known.delete(workItemId);
    }
    for (const workItemId of this.failures.keys()) {
      if (!workItemIds.has(workItemId)) this.failures.delete(workItemId);
    }
  }

  ensureProbed(root: TrackedWorkItem): void {
    this.ensureItemsProbed(root.children);
  }

  ensureItemsProbed(roots: readonly TrackedWorkItem[]): void {
    if (this.reading) return;
    const stale = descendantsIncluding(roots).filter(
      (item) => item.noteCount > 0 && this.needsReading(item),
    );
    if (stale.length === 0) return;
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

  private needsReading(item: TrackedWorkItem): boolean {
    const seen = this.known.get(item.id)?.noteCount ?? this.failures.get(item.id);
    return seen !== item.noteCount;
  }

  private async read(stale: TrackedWorkItem[]): Promise<void> {
    const counts = new Map(stale.map((item) => [item.id, item.noteCount]));
    try {
      const result = await this.reader.readNoteActivity({
        workItemIds: [...counts.keys()],
        excludedPrefixes: [...this.excludedPrefixes],
      });
      const answered = new Set<number>();
      for (const entry of result.activity) {
        const noteCount = counts.get(entry.workItemId);
        if (noteCount === undefined) continue;
        answered.add(entry.workItemId);
        this.failures.delete(entry.workItemId);
        this.known.set(entry.workItemId, {
          noteCount,
          newestNoteAt: epochOf(entry.newestNoteDate),
        });
      }
      this.recordUnanswered(counts, answered, result.error);
    } catch (error) {
      for (const [workItemId, noteCount] of counts) this.failures.set(workItemId, noteCount);
      this.logger.error(
        "New notes filter: reading the board's discussion dates threw. Those items will not be " +
          "shown as newly commented.",
        error,
      );
    }
  }

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
        `New notes filter: ${lost} discussion date(s) could not be read - ${error ?? "no reason given"}. ` +
          "Those items will not be shown as newly commented.",
      );
    }
  }

  private reportSettled(): void {
    this.logger.info(
      `New notes filter settled: known=${this.known.size}, failed=${this.failures.size}.`,
    );
    const waiters = this.settleWaiters;
    this.settleWaiters = [];
    for (const resolve of waiters) resolve();
  }
}

function epochOf(iso: string | null): number {
  if (iso === null) return Number.NEGATIVE_INFINITY;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
}

function descendantsIncluding(roots: readonly TrackedWorkItem[]): TrackedWorkItem[] {
  const collected: TrackedWorkItem[] = [];
  const pending = [...roots];
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) break;
    collected.push(item);
    pending.push(...item.children);
  }
  return collected;
}
