/** What the MAIN-world reader is handed: the endpoint the worker resolved, and who to ask about. */
export interface ReadProjectQueryLinksConfig {
  /** The `_apis/wit/workitemsbatch` endpoint, already built from the sender's trusted tab URL. */
  batchUrl: string;
  ids: number[];
}

/** The expanded work items, or why they could not be read. */
export interface ReadProjectQueryLinksOutcome {
  ok: boolean;
  raw?: unknown;
  error?: string;
}

/**
 * Read which projects carry a tracking-query link, from inside the ADO page's MAIN world.
 *
 * WHY this exists / why it must stay self-contained: the extension's content script runs in an
 * isolated world whose origin is `chrome-extension://…`, so its cross-origin fetch to ADO is
 * CORS-blocked, and a same-origin fetch from an extension page drops ADO's SameSite session cookies.
 * The only path that is BOTH same-origin AND signed in is a fetch running in the ADO tab's MAIN
 * world. This function is injected verbatim through
 * `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`: it must not reference any import, module-scoped value, or build
 * helper — only its parameters and page globals. Promise chaining (not async/await) keeps a
 * transpiler helper from being hoisted out of the body.
 */
export function readProjectQueryLinksInPage(
  config: ReadProjectQueryLinksConfig,
): Promise<ReadProjectQueryLinksOutcome> {
  // ADO's batch endpoint caps a request at 200 ids and rejects a longer one outright, so a catalog
  // holding more projects than that is read in pages rather than failing wholesale.
  const BATCH_SIZE = 200;

  const readPage = (
    offset: number,
    collected: unknown[],
  ): Promise<ReadProjectQueryLinksOutcome> => {
    const ids = config.ids.slice(offset, offset + BATCH_SIZE);
    if (ids.length === 0) {
      return Promise.resolve({ ok: true, raw: { value: collected } });
    }
    return fetch(config.batchUrl, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids: ids, $expand: "Relations" }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("HTTP " + String(response.status));
        return response.json();
      })
      .then((body: unknown) => {
        const value = (body as { value?: unknown } | null)?.value;
        const page = Array.isArray(value) ? value : [];
        return readPage(offset + ids.length, collected.concat(page));
      });
  };

  return readPage(0, []).catch((error: unknown): ReadProjectQueryLinksOutcome => ({
    ok: false,
    error: String(error),
  }));
}
