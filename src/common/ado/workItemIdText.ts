// Every address shape ADO uses for one item: the web form (`_workitems/edit/123`), the REST
// resource (`_apis/wit/workItems/123`), and a board or query opened on an item (`?workitem=123`).
const WORK_ITEM_URL_ID = /(?:_workitems\/edit|\/workitems)\/(\d+)|[?&]workitem=(\d+)/i;

// What people copy along with a bare number: `[123]`, `(123)`, `{123}`, `1 234`, `12-34`. Kept to
// exactly these so any other text (a word, a `#`, a decimal point) is never read as an id.
const NUMBER_DECORATION = /[\s\-[\](){}]/g;

/**
 * Reads a work item id out of free text: either a work item URL, or a bare number wrapped in the
 * punctuation people copy along with it. Anything else — words, a URL to some other page — is
 * `null`, so pasted prose is never mistaken for an id.
 */
export function parseWorkItemId(text: string): number | null {
  const trimmed = text.trim();
  const fromUrl = trimmed.includes("://") ? WORK_ITEM_URL_ID.exec(trimmed) : null;
  const digits = fromUrl
    ? (fromUrl[1] ?? fromUrl[2] ?? "")
    : trimmed.replace(NUMBER_DECORATION, "");
  if (!/^\d+$/.test(digits)) return null;
  const id = Number(digits);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
