import type { ILogger } from "../logging/ILogger";

/** One work item the reader set aside while collecting. */
export interface CollectedItem {
  id: number;
  title: string;
  /** The work item type's name, resolved to its icon when the collection is shown. */
  type: string;
  /** The item's Azure DevOps deep link; null when the page address resolves to no project. */
  url: string | null;
}

/**
 * A reader-driven set of work items gathered across views and queries.
 *
 * Kept as an interface so the context menu (which starts, ends and fills it) and the floating
 * collector UI (which shows and empties it) depend on the contract, never on each other.
 */
export interface IItemCollection {
  /** Whether a collection is running; an inactive collection holds nothing. */
  readonly isActive: boolean;
  /** The collected items in the order they were added. */
  items(): readonly CollectedItem[];
  has(id: number): boolean;
  /** Begins collecting; a no-op while already active. */
  start(): void;
  /** Stops collecting and drops every item, releasing everything the collection held. */
  end(): void;
  /** Adds the item when absent, removes it when present; ignored while inactive. */
  toggle(item: CollectedItem): void;
  remove(id: number): void;
  /** Called after every change. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** A running collection's contents; `null` stands for no collection running. */
export type ItemCollectionState = { readonly items: readonly CollectedItem[] } | null;

/**
 * A collection whose whole state can be replaced by a copy kept elsewhere — another tab or another
 * of the reader's browsers — so a collection started in one place continues in the next.
 */
export interface IRestorableItemCollection extends IItemCollection {
  /** Replaces the collection with `state`, notifying subscribers only when something changed. */
  restore(state: ItemCollectionState): void;
}

/** The in-memory collection one content runtime shares across every view it paints. */
export class ItemCollection implements IRestorableItemCollection {
  // A Map keeps insertion order, which is the order the reader collected in.
  private readonly collected = new Map<number, CollectedItem>();
  private readonly listeners = new Set<() => void>();
  private active = false;

  constructor(private readonly logger: ILogger) {}

  get isActive(): boolean {
    return this.active;
  }

  items(): readonly CollectedItem[] {
    return [...this.collected.values()];
  }

  has(id: number): boolean {
    return this.collected.has(id);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.logger.info("Work item collection started.");
    this.notify();
  }

  end(): void {
    if (!this.active) return;
    const count = this.collected.size;
    this.active = false;
    this.collected.clear();
    this.logger.info(`Work item collection ended with ${count} item(s).`);
    this.notify();
  }

  toggle(item: CollectedItem): void {
    if (!this.active) {
      this.logger.info(`Work item ${item.id} not collected: no collection is running.`);
      return;
    }
    if (!this.collected.delete(item.id)) {
      this.collected.set(item.id, { ...item });
    }
    this.notify();
  }

  remove(id: number): void {
    if (this.collected.delete(id)) {
      this.notify();
    }
  }

  restore(state: ItemCollectionState): void {
    if (state === null) {
      this.restoreInactive();
      return;
    }
    if (this.active && sameItems(this.items(), state.items)) return;
    const resumed = !this.active;
    this.active = true;
    this.collected.clear();
    for (const item of state.items) {
      this.collected.set(item.id, { ...item });
    }
    if (resumed) {
      // Logged on the flip only: every remote toggle also lands here and must not flood the log.
      this.logger.info(
        `Work item collection continued from another tab or device with ${this.collected.size} item(s).`,
      );
    }
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private restoreInactive(): void {
    if (!this.active) return;
    this.active = false;
    this.collected.clear();
    this.logger.info("Work item collection ended in another tab or device.");
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        // One broken subscriber must not stop the others from showing the change.
        this.logger.error("A work item collection subscriber failed.", error);
      }
    }
  }
}

function sameItems(left: readonly CollectedItem[], right: readonly CollectedItem[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        item.id === other.id &&
        item.title === other.title &&
        item.type === other.type &&
        item.url === other.url
      );
    })
  );
}
