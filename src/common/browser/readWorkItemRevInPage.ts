/** Everything the in-page revision read needs, bundled into one serializable argument. */
export interface ReadWorkItemRevConfig {
  /** The item's `_apis/wit/workitems/{id}` endpoint, built by the worker from its own tab URL. */
  itemUrl: string;
}

/**
 * Read one work item's current `System.Rev` from inside the ADO page's MAIN world.
 *
 * WHY this exists / why it must stay self-contained: In Manifest V3 the extension's content script
 * runs in an isolated world whose origin is `chrome-extension://…`, so its cross-origin fetch to ADO
 * is CORS-blocked; a same-origin fetch from the extension page instead drops ADO's SameSite session
 * cookies and hits a login loop. The only path that is BOTH same-origin AND carries the signed-in
 * session is a fetch running in the ADO tab's MAIN (page) world. This function is therefore injected
 * verbatim via `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`. It must not reference any import, module-scoped variable, or build
 * helper — only its parameter and page globals (`fetch`, `Promise`). Promise chaining (not
 * async/await) avoids any transpiler helper being hoisted out of the function body.
 *
 * WHY a caller needs it: a reorder bumps `System.Rev` — the backlog rank is a field on the item —
 * but `_apis/work/workitemsorder` answers with positions only and never mentions the revision. A
 * caller left holding the rev it moved the item with has its NEXT field write refused with HTTP 412
 * until the board is reloaded. Kept OUT of `reorderWorkItemInPage` so each injected function stays
 * small enough to read, and so this one can be unit-tested on its own.
 *
 * `null` means the revision could not be read — never a guess. The move it follows has already
 * landed by then, so the caller keeps what it had rather than treating an applied move as failed.
 */
export function readWorkItemRevInPage(config: ReadWorkItemRevConfig): Promise<number | null> {
  return fetch(config.itemUrl, {
    credentials: "include",
    headers: { Accept: "application/json" },
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((json) => {
      const rev = (json as { rev?: unknown } | null)?.rev;
      // Finite, not merely "a number": a NaN would travel on as the item's rev and serialize into
      // the next patch as `null`, turning this read into the bug it exists to prevent.
      return typeof rev === "number" && Number.isFinite(rev) ? rev : null;
    })
    .catch(() => null);
}
