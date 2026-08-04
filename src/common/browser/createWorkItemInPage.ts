/** What the MAIN-world creator is handed: the endpoint the worker resolved, and the patch to send. */
export interface CreateWorkItemConfig {
  /** The `_apis/wit/workitems/${type}` endpoint, already built from the sender's trusted tab URL. */
  createUrl: string;
  /** The JSON Patch document giving the new item its title, tags, paths, and parent link. */
  patch: readonly { op: string; path: string; value: string | { rel: string; url: string } }[];
}

/** The serializable answer: the created item, or why nothing was created. */
export interface CreateWorkItemOutcome {
  ok: boolean;
  raw?: unknown;
  error?: string;
}

/**
 * Create one work item from inside the ADO page's MAIN world.
 *
 * WHY this exists / why it must stay self-contained: the extension's content script runs in an
 * isolated world whose origin is `chrome-extension://…`, so its cross-origin fetch to ADO is
 * CORS-blocked, and a same-origin fetch from an extension page drops ADO's SameSite session cookies.
 * The only path that is BOTH same-origin AND signed in is a fetch running in the ADO tab's MAIN
 * world. This function is therefore injected verbatim through
 * `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`: it must not reference any import, module-scoped value, or build
 * helper — only its parameters and page globals. Promise chaining (not async/await) keeps a
 * transpiler helper from being hoisted out of the body.
 *
 * Creation is deliberately NOT retried on failure. Every other read in this extension retries
 * because a repeated GET costs nothing; repeating a POST that may already have succeeded would leave
 * a duplicate project in the catalog, which is far worse than reporting the error.
 */
export function createWorkItemInPage(config: CreateWorkItemConfig): Promise<CreateWorkItemOutcome> {
  return fetch(config.createUrl, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json-patch+json", Accept: "application/json" },
    body: JSON.stringify(config.patch),
  })
    .then((response): CreateWorkItemOutcome | Promise<CreateWorkItemOutcome> => {
      if (!response.ok) {
        return { ok: false, error: "HTTP " + String(response.status) };
      }
      return response.json().then(
        (raw: unknown): CreateWorkItemOutcome => ({ ok: true, raw }),
        (error: unknown): CreateWorkItemOutcome => ({
          ok: false,
          error: "invalid JSON: " + String(error),
        }),
      );
    })
    .catch((error: unknown): CreateWorkItemOutcome => ({ ok: false, error: String(error) }));
}
