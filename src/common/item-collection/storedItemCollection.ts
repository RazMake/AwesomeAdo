import type { CollectedItem, ItemCollectionState } from "./ItemCollection";

/** The synced storage key the running collection is kept under. */
export const ITEM_COLLECTION_STORAGE_KEY = "itemCollection";

/**
 * The byte budget one stored collection may use.
 *
 * Browser sync caps a single key at 8192 UTF-8 bytes counted as the key plus its JSON value; the
 * small margin absorbs any difference in how the browser serializes the value.
 */
const STORED_BYTES_BUDGET = 8000;

const STORED_FORMAT_VERSION = 1;
const ELLIPSIS = "…";

/**
 * A stored item's link: absent, an index into the shared link prefixes (`prefix + id`), or a whole
 * URL that does not follow that pattern.
 */
type StoredLink = null | number | string;
type StoredItem = [id: number, type: string, title: string, link: StoredLink];

/** The compact shape kept in synced storage; `null` means no collection is running. */
export type StoredItemCollection = {
  v: typeof STORED_FORMAT_VERSION;
  prefixes: string[];
  items: StoredItem[];
} | null;

/**
 * Encodes a collection for synced storage.
 *
 * Deep links share one prefix per project, so each prefix is stored once and items point at it.
 * When the collection would still exceed the per-key sync budget, titles are shortened evenly:
 * a title is only a display hint, while the ids, types and links are what the collection is for.
 */
export function encodeItemCollection(state: ItemCollectionState): StoredItemCollection {
  if (state === null) return null;
  const prefixes: string[] = [];
  const linked = state.items.map((item) => ({ item, link: storedLink(item, prefixes) }));
  const encode = (maxTitle: number): StoredItemCollection => ({
    v: STORED_FORMAT_VERSION,
    prefixes,
    items: linked.map(({ item, link }) => [
      item.id,
      item.type,
      shorten(item.title, maxTitle),
      link,
    ]),
  });
  const full = encode(Number.POSITIVE_INFINITY);
  if (fits(full)) return full;
  let low = 0;
  let high = Math.max(0, ...state.items.map((item) => item.title.length));
  // The longest title length that still fits; binary search keeps encoding cheap for long lists.
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(encode(middle))) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return encode(low);
}

/** Whether the stored value stays inside the per-key sync budget. */
export function fitsSyncBudget(value: StoredItemCollection): boolean {
  return fits(value);
}

/** Reads a stored collection back; anything unrecognisable reads as no collection running. */
export function decodeItemCollection(raw: unknown): ItemCollectionState {
  if (!isRecord(raw) || raw.v !== STORED_FORMAT_VERSION || !Array.isArray(raw.items)) return null;
  const prefixes = Array.isArray(raw.prefixes) ? raw.prefixes : [];
  const items: CollectedItem[] = [];
  const seen = new Set<number>();
  for (const entry of raw.items) {
    const item = decodeItem(entry, prefixes);
    if (item !== null && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }
  return { items };
}

function storedLink(item: CollectedItem, prefixes: string[]): StoredLink {
  if (item.url === null) return null;
  const suffix = String(item.id);
  if (!item.url.endsWith(suffix)) return item.url;
  const prefix = item.url.slice(0, -suffix.length);
  const known = prefixes.indexOf(prefix);
  if (known >= 0) return known;
  prefixes.push(prefix);
  return prefixes.length - 1;
}

function shorten(title: string, maxLength: number): string {
  if (title.length <= maxLength) return title;
  return maxLength === 0 ? "" : `${title.slice(0, maxLength - 1)}${ELLIPSIS}`;
}

const utf8 = new TextEncoder();

function fits(value: StoredItemCollection): boolean {
  const bytes = utf8.encode(ITEM_COLLECTION_STORAGE_KEY + JSON.stringify(value)).length;
  return bytes <= STORED_BYTES_BUDGET;
}

function decodeItem(entry: unknown, prefixes: readonly unknown[]): CollectedItem | null {
  if (!Array.isArray(entry)) return null;
  const [id, type, title, link] = entry as unknown[];
  if (!Number.isSafeInteger(id) || (id as number) <= 0) return null;
  if (typeof type !== "string" || typeof title !== "string") return null;
  const url = decodeLink(link, id as number, prefixes);
  return url === undefined ? null : { id: id as number, type, title, url };
}

/** The item's URL, `null` for none, or `undefined` when the stored link is malformed. */
function decodeLink(
  link: unknown,
  id: number,
  prefixes: readonly unknown[],
): string | null | undefined {
  if (link === null) return null;
  if (typeof link === "string") return link;
  if (typeof link !== "number") return undefined;
  const prefix = prefixes[link];
  return typeof prefix === "string" ? `${prefix}${id}` : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
