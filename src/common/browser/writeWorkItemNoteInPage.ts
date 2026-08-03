import type { WriteWorkItemNoteConfig, WriteWorkItemNoteResponse } from "./WorkItemNoteRequest";

/**
 * Post a new discussion note, or rewrite an existing one, from inside the ADO page's MAIN world.
 *
 * WHY this exists / why it must stay self-contained: In Manifest V3 the extension's content script
 * runs in an isolated world whose origin is `chrome-extension://…`, so its cross-origin fetch to ADO
 * is CORS-blocked; a same-origin fetch from the extension page instead drops ADO's SameSite session
 * cookies and hits a login loop. The only path that is BOTH same-origin AND carries the signed-in
 * session is a fetch running in the ADO tab's MAIN (page) world. This function is therefore injected
 * verbatim via `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`. It must not reference any import, module-scoped variable, or build
 * helper — only its parameters and page globals (`fetch`, `Promise`, `JSON`). Promise chaining (not
 * async/await) avoids any transpiler helper being hoisted out of the function body.
 *
 * `POST` creates, `PATCH` rewrites — the caller picks by passing the method, because the two differ
 * only in that verb and the id already baked into the URL. Azure DevOps rejects an edit from anyone
 * but the note's original author, so authorization stays where it belongs (the server) rather than
 * being asserted here.
 *
 * A stored note is followed by a re-read of the ITEM, because writing a comment creates a new work
 * item revision that the comments API never mentions: without this the caller's cached `System.Rev`
 * is one behind from here on, and its next field write on that item is refused with HTTP 412 until
 * the board is reloaded. The note is already saved by then, so a failed re-read degrades to "no rev
 * to report" rather than turning a successful write into a failure.
 */
export function writeWorkItemNoteInPage(
  config: WriteWorkItemNoteConfig,
): Promise<WriteWorkItemNoteResponse> {
  function withCurrentRev(
    saved: WriteWorkItemNoteResponse,
  ): Promise<WriteWorkItemNoteResponse> | WriteWorkItemNoteResponse {
    if (!config.workItemUrl) {
      return saved;
    }
    return fetch(config.workItemUrl, {
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { rev?: unknown } | null) => {
        const rev = body === null ? null : body.rev;
        return typeof rev === "number" ? { ok: true, raw: saved.raw, rev: rev } : saved;
      })
      .catch(() => saved);
  }

  return fetch(config.url, {
    method: config.method,
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ text: config.text }),
  })
    .then((response) => {
      if (!response.ok) {
        const failed: WriteWorkItemNoteResponse = {
          ok: false,
          error: "HTTP " + String(response.status),
        };
        return failed;
      }
      return response.json().then((json) => withCurrentRev({ ok: true, raw: json }));
    })
    .catch((err) => {
      const failed: WriteWorkItemNoteResponse = { ok: false, error: String(err) };
      return failed;
    });
}
