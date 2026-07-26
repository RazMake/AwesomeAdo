export interface FeatureCrewApplyConfig {
  mode: "create" | "update";
  url: string;
  description: string;
  title?: string;
  state?: string;
  rootRelationUrl?: string;
  affectedByRel?: string;
  /**
   * Org-level work-items base (`.../workitems`), required for `create`. ADO process rules reject
   * creating an item directly in a closed state such as "Removed", so create runs in two steps and
   * this base lets it build the id-scoped URL for the follow-up state transition once the id exists.
   */
  itemBaseUrl?: string;
}

/**
 * Outcome of a feature-crew write. On success `id` is the work item's numeric id and `error` is
 * absent; on any failure `id` is `null` and `error` carries the specific reason (HTTP status plus
 * ADO's error message, a malformed-body note, or the thrown value) so the caller can log exactly
 * why the write was rejected instead of a bare "write failed".
 */
export interface FeatureCrewApplyResult {
  id: number | null;
  error?: string;
}

/**
 * Create or update a feature-crew work item in the ADO page world.
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
 * NOTE: ADO process transition rules reject creating a work item directly in a closed state such as
 * "Removed". The `create` path therefore runs in two steps against the page's session: first POST the
 * item in its default new state, then immediately PATCH it to the requested `state`. If either step
 * is rejected this resolves `{ id: null, error }` carrying the HTTP status and ADO's message (the
 * caller degrades and logs that detail).
 */
export function applyFeatureCrewInPage(
  config: FeatureCrewApplyConfig,
): Promise<FeatureCrewApplyResult> {
  // Send one json-patch request and resolve to the parsed body on success, or a `{ error }` shape
  // carrying ADO's specific reason (status + message) on any non-ok / read failure. Defined inline
  // (not imported) because this whole function is serialized and injected into the ADO MAIN world.
  const sendJsonPatch = (
    url: string,
    method: string,
    ops: unknown[],
  ): Promise<{ body: unknown } | { error: string }> =>
    fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json-patch+json", Accept: "application/json" },
      body: JSON.stringify(ops),
    }).then((response) => {
      if (response.ok) {
        return response.json().then((body) => ({ body }));
      }
      // Non-ok: read ADO's error body so the reason (e.g. a process rule blocking the state
      // transition, a permission error, or an optimistic-concurrency conflict) reaches the log. ADO
      // returns a JSON envelope whose `message` is the human-readable cause; fall back to the raw
      // text, then to just the status, so a failure can never be logged without at least the code.
      return response.text().then(
        (text) => {
          let detail = text;
          try {
            const parsed = JSON.parse(text) as { message?: unknown };
            if (typeof parsed.message === "string" && parsed.message.length > 0) {
              detail = parsed.message;
            }
          } catch {
            // Body was not JSON (e.g. an HTML sign-in page); keep the raw text as the detail.
          }
          const suffix = detail.length > 0 ? ": " + detail : "";
          return { error: "HTTP " + String(response.status) + suffix };
        },
        () => ({ error: "HTTP " + String(response.status) }),
      );
    });

  const readId = (body: unknown): number | null => {
    const id = (body as { id?: unknown } | null)?.id;
    return typeof id === "number" ? id : null;
  };

  // Turn a completed json-patch outcome into the final result: propagate ADO's specific error
  // verbatim, otherwise require the numeric id the caller keys off of. Shared by both write paths.
  const toResult = (outcome: { body: unknown } | { error: string }): FeatureCrewApplyResult => {
    if ("error" in outcome) {
      return { id: null, error: outcome.error };
    }
    const id = readId(outcome.body);
    return id === null ? { id: null, error: "response had no numeric work item id" } : { id };
  };

  // Render System.Description as Markdown; without this ADO stores the field as HTML and collapses
  // the roster's newlines onto one line, so every crew member runs into the title. Shared by the
  // update and create payloads so the two representations cannot drift apart.
  const descriptionOps = [
    { op: "add", path: "/fields/System.Description", value: config.description },
    { op: "add", path: "/multilineFieldsFormat/System.Description", value: "Markdown" },
  ];

  if (config.mode === "update") {
    return sendJsonPatch(config.url, "PATCH", descriptionOps)
      .then(toResult)
      .catch((err) => ({ id: null, error: String(err) }));
  }

  // Create in the default new state (no System.State op), then transition to the requested closed
  // state, because ADO rejects a direct create into "Removed".
  const createOps = [
    { op: "add", path: "/fields/System.Title", value: config.title },
    ...descriptionOps,
    {
      op: "add",
      path: "/relations/-",
      value: { rel: config.affectedByRel, url: config.rootRelationUrl },
    },
  ];
  return sendJsonPatch(config.url, "POST", createOps)
    .then((created) => {
      const result = toResult(created);
      // On any create failure (error body or a 2xx with no id) stop here; there is nothing to
      // transition and `result` already carries the reason.
      if (result.id === null) return result;
      // The item now exists but is stuck in its new state; a transition failure strands it, so report
      // that error carrying the id the caller needs to find it for cleanup.
      const stateOps = [{ op: "add", path: "/fields/System.State", value: config.state }];
      return sendJsonPatch(
        config.itemBaseUrl + "/" + String(result.id) + "?api-version=7.1",
        "PATCH",
        stateOps,
      ).then((transitioned) =>
        "error" in transitioned ? { id: null, error: transitioned.error } : result,
      );
    })
    .catch((err) => ({ id: null, error: String(err) }));
}
