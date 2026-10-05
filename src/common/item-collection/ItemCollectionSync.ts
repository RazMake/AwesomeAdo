import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";
import { observeStorageKeys } from "../browser/observeStorageKeys";
import type { ILogger } from "../logging/ILogger";

import type { IRestorableItemCollection, ItemCollectionState } from "./ItemCollection";
import {
  decodeItemCollection,
  encodeItemCollection,
  fitsSyncBudget,
  ITEM_COLLECTION_STORAGE_KEY,
} from "./storedItemCollection";

/**
 * Keeps one tab's work item collection and the reader's synced copy in step, so a collection
 * started in one view, tab or browser continues in every other one.
 *
 * Every local change writes the whole collection; every stored change replaces the local one. The
 * storage area reports this tab's own writes back to it, in commit order, so writes still in flight
 * are remembered: an echo of an older write, or another tab's write that this tab's newer write will
 * overwrite, must not roll the collection back while the reader keeps collecting.
 */
export class ItemCollectionSync {
  /** Canonical JSON of this tab's writes not yet reported back, oldest first. */
  private readonly inFlight: string[] = [];
  private applyingStored = false;
  private overBudget = false;

  constructor(
    private readonly collection: IRestorableItemCollection,
    private readonly storage: IBrowserSyncStorage,
    private readonly logger: ILogger,
  ) {}

  /** Starts following both sides; returns the function that stops. */
  connect(): () => void {
    const stopLocal = this.collection.subscribe(() => {
      if (!this.applyingStored) this.persist();
    });
    const observation = observeStorageKeys(
      this.storage,
      [ITEM_COLLECTION_STORAGE_KEY],
      (raw) => raw[ITEM_COLLECTION_STORAGE_KEY],
      (stored) => {
        this.applyStored(stored);
      },
    );
    observation.ready.catch((error: unknown) => {
      this.logger.error("The synced work item collection could not be read.", error);
    });
    return () => {
      stopLocal();
      observation.unsubscribe();
    };
  }

  private localState(): ItemCollectionState {
    return this.collection.isActive ? { items: this.collection.items() } : null;
  }

  private persist(): void {
    const value = encodeItemCollection(this.localState());
    if (!this.checkBudget(fitsSyncBudget(value))) return;
    const json = JSON.stringify(value);
    this.inFlight.push(json);
    this.storage.set(ITEM_COLLECTION_STORAGE_KEY, value).catch((error: unknown) => {
      this.forget(json);
      this.logger.error("The work item collection could not be synced to other tabs.", error);
    });
  }

  /** Logs only when the collection crosses the sync size limit, not on every change past it. */
  private checkBudget(fits: boolean): boolean {
    if (!fits && !this.overBudget) {
      this.logger.error(
        `The work item collection (${this.collection.items().length} items) is too large to sync; ` +
          "other tabs and devices keep the last collection that fit.",
        new Error("Work item collection exceeds the synced storage size limit."),
      );
    } else if (fits && this.overBudget) {
      this.logger.info("The work item collection fits the sync size limit again.");
    }
    this.overBudget = !fits;
    return fits;
  }

  private applyStored(stored: unknown): void {
    const state = decodeItemCollection(stored);
    // Re-encoding gives a canonical form, immune to how the storage area round-trips the value.
    const json = JSON.stringify(encodeItemCollection(state));
    const echoed = this.inFlight.indexOf(json);
    if (echoed >= 0) {
      this.inFlight.splice(0, echoed + 1);
    }
    if (this.inFlight.length > 0) return;
    if (json === JSON.stringify(encodeItemCollection(this.localState()))) return;
    this.applyingStored = true;
    try {
      this.collection.restore(state);
    } finally {
      this.applyingStored = false;
    }
  }

  private forget(json: string): void {
    const index = this.inFlight.indexOf(json);
    if (index >= 0) this.inFlight.splice(index, 1);
  }
}
