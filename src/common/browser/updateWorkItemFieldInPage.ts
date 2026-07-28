import type {
  UpdateWorkItemFieldConfig,
  UpdateWorkItemFieldResponse,
} from "./WorkItemFieldRequest";

/**
 * Update a single work item field from inside the ADO page's MAIN world.
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
 * WHY ONE CONFIG OBJECT rather than an argument each: `executeScript` requires every entry of `args`
 * to be JSON-serializable, and `undefined` is not — so an omitted optional argument leaves an
 * unserializable HOLE in that array and Chrome rejects the whole injection before it runs. That
 * surfaces as a bare `"exception"` with no request ever reaching ADO, which reads exactly like a
 * write failure and is nothing of the kind. Optional *properties* of an object simply disappear when
 * it is serialized, so the config can keep growing safely — the same reason `FeatureCrewApplyConfig`
 * is shaped this way.
 *
 * A `null` value clears the field (JSON Patch `remove`); any other value sets it (`add`).
 *
 * `multilineFormat` (when supplied) adds the patch operation ADO needs to store a multiline field as
 * Markdown rather than HTML. It is part of the SAME patch as the value: a field still on `Html`
 * stores Markdown source verbatim, so setting the format afterwards would leave one revision of
 * literal asterisks behind, and setting it in a separate request would cost a second rev the
 * optimistic-concurrency test would then have to be re-based on.
 *
 * `comment` (when supplied) adds a discussion comment to the SAME patch, via `System.History`. Same
 * reasoning taken further: posting a comment through the comments API creates its own revision, so a
 * field write issued after one is rejected by the `test /rev` above (HTTP 412) — and a field write
 * issued before one can succeed while the comment explaining it fails. One patch makes them one
 * revision. The text arrives as PLAIN TEXT and is escaped here because `System.History` is an HTML
 * field: unescaped, a `<` in someone's reason would be swallowed as markup.
 *
 * `baseValue` (when supplied) authorizes ONE rebase-and-retry after a stale-rev rejection, and is
 * the whole reason a tag edit does not simply die when something else advanced the item's rev.
 * Several things bump `System.Rev` without ever reporting the new value — a drag-reorder, the rank
 * fallback, a note posted through the comments API, anyone editing the item in ADO's own UI — so a
 * cached rev goes stale on its own and every later write is refused with HTTP 412 until the board is
 * reloaded. On such a refusal this re-reads the item and retries ONLY when the field being written
 * still holds `baseValue`, i.e. when the conflict was never about this field. If the field itself
 * moved, the conflict is reported: ADR-030's "no auto-rebase" exists so a concurrent edit is never
 * silently overwritten, and that is exactly the case this still refuses.
 */
export function updateWorkItemFieldInPage(
  config: UpdateWorkItemFieldConfig,
): Promise<UpdateWorkItemFieldResponse> {
  const field = config.field;
  const base = config.baseValue;

  function buildPatch(rev: number): { op: string; path: string; value?: unknown }[] {
    const operations: { op: string; path: string; value?: unknown }[] = [
      { op: "test", path: "/rev", value: rev },
      config.value === null
        ? { op: "remove", path: "/fields/" + field }
        : { op: "add", path: "/fields/" + field, value: config.value },
    ];
    if (config.multilineFormat) {
      operations.push({
        op: "add",
        path: "/multilineFieldsFormat/" + field,
        value: config.multilineFormat,
      });
    }
    if (config.comment) {
      operations.push({
        op: "add",
        path: "/fields/System.History",
        value: config.comment
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\r?\n/g, "<br>"),
      });
    }
    return operations;
  }

  // `mayRebase` is false on the retry, so a rebase happens at most once: a second refusal means the
  // item is moving faster than we can write it, and looping would only fight it.
  function sendPatch(rev: number, mayRebase: boolean): Promise<UpdateWorkItemFieldResponse> {
    return fetch(config.updateUrl, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json-patch+json", Accept: "application/json" },
      body: JSON.stringify(buildPatch(rev)),
    }).then((response): UpdateWorkItemFieldResponse | Promise<UpdateWorkItemFieldResponse> => {
      if (response.ok) {
        return response.json().then((json) => {
          const newRev = (json as { rev?: unknown }).rev;
          return { ok: true, rev: typeof newRev === "number" ? newRev : undefined };
        });
      }
      const failure: UpdateWorkItemFieldResponse = {
        ok: false,
        error: "HTTP " + String(response.status),
      };
      // 412 is the `test /rev` op being refused; 409 is ADO's other shape of the same conflict.
      const staleRev = response.status === 412 || response.status === 409;
      return mayRebase && staleRev ? rebase(failure) : failure;
    });
  }

  function rebase(failure: UpdateWorkItemFieldResponse): Promise<UpdateWorkItemFieldResponse> {
    return fetch(config.updateUrl, {
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { rev?: unknown; fields?: Record<string, unknown> } | null) => {
        const rev = body?.rev;
        if (typeof rev !== "number") {
          return failure;
        }
        // An unset field is simply ABSENT from `fields`, so absent and empty must read alike or a
        // change that clears a field could never be rebased.
        const stored = body?.fields?.[field];
        const current = stored === undefined || stored === null ? "" : String(stored).trim();
        const expected = base === undefined || base === null ? "" : base.trim();
        return current === expected
          ? sendPatch(rev, false)
          : { ok: false, error: failure.error + " — the field changed since it was read" };
      })
      .catch(() => failure);
  }

  return sendPatch(config.rev, base !== undefined).catch((err): UpdateWorkItemFieldResponse => {
    return { ok: false, error: String(err) };
  });
}
