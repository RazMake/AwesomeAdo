/**
 * Subscribe to changes of a single key within one `chrome.storage` area.
 *
 * Shared by the sync and local storage adapters so the change-event filtering (which fires for
 * every key in every area) lives in exactly one tested place instead of being copied per area.
 * Returns an unsubscribe function; call it to stop listening.
 */
export function onStorageAreaChange(
  area: chrome.storage.AreaName,
  key: string,
  listener: (value: unknown) => void,
): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName === area && key in changes) {
      listener(changes[key]?.newValue);
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
