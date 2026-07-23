/**
 * Minimal, promise-based key/value contract shared by the browser storage areas.
 *
 * The synced and device-local areas expose the exact same operations — read, write, and observe a
 * single key — so that shape is defined once here and each area re-exports it under an intent-
 * revealing name (IBrowserSyncStorage, IBrowserLocalStorage). Segregated from ISettingsStore on
 * purpose (Interface Segregation): this layer knows nothing about settings shapes.
 */
export interface IBrowserKeyValueStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  /** Observe changes to a key; returns an unsubscribe function. */
  subscribe(key: string, listener: (value: unknown) => void): () => void;
}
