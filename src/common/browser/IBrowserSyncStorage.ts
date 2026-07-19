/**
 * Minimal, promise-based abstraction over the browser's synced key/value storage.
 *
 * Segregated from ISettingsStore on purpose (Interface Segregation): this layer knows nothing
 * about settings shapes — only about reading/writing/observing a single key.
 */
export interface IBrowserSyncStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  /** Observe changes to a key; returns an unsubscribe function. */
  subscribe(key: string, listener: (value: unknown) => void): () => void;
}
