/** One rank write, addressed by the URL the background worker built from its own trusted tab URL. */
export interface WorkItemRankTarget {
  id: number;
  /** `_apis/wit/workitems/{id}` — the JSON Patch endpoint for this item. */
  url: string;
  rank: number;
}

/** Everything the in-page rank write needs, bundled into one serializable argument. */
export interface WriteWorkItemRanksConfig {
  /** The rank field to write (`Microsoft.VSTS.Common.StackRank`). */
  field: string;
  writes: WorkItemRankTarget[];
}

/** Whether every write landed, and which ones did not. */
export interface WriteWorkItemRanksResponse {
  ok: boolean;
  /** The ids that were written, so a partial failure still says what did change. */
  written?: number[];
  error?: string;
}

/**
 * Write a backlog rank onto one or more work items from inside the ADO page's MAIN world.
 *
 * WHY this exists / why it must stay self-contained: In Manifest V3 the extension's content script
 * runs in an isolated world whose origin is `chrome-extension://…`, so its cross-origin fetch to ADO
 * is CORS-blocked; a same-origin fetch from the extension page instead drops ADO's SameSite session
 * cookies and hits a login loop. The only path that is BOTH same-origin AND carries the signed-in
 * session is a fetch running in the ADO tab's MAIN (page) world. This function is therefore injected
 * verbatim via `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`. It must not reference any import, module-scoped variable, or build
 * helper — only its parameter and page globals (`fetch`, `Promise`, `JSON`). Promise chaining (not
 * async/await) avoids any transpiler helper being hoisted out of the function body.
 *
 * WHY no `test /rev` guard, unlike every other patch this extension sends: the rank being written was
 * computed from a read taken moments earlier in the same operation, and it is a POSITION in a list
 * rather than a value a person authored. Guarding it on a revision would reject the write whenever
 * anyone had touched an unrelated field of a sibling — and in the renumber case that would leave the
 * level half-ranked, which is strictly worse than the last writer winning a rank nobody types by hand.
 *
 * The writes run one after another rather than at once so a failure names the item it belongs to and
 * the ones before it are known to have landed.
 */
export function writeWorkItemRanksInPage(
  config: WriteWorkItemRanksConfig,
): Promise<WriteWorkItemRanksResponse> {
  const path = "/fields/" + config.field;
  const written: number[] = [];
  const failures: string[] = [];

  const writeOne = (target: {
    id: number;
    url: string;
    rank: number;
  }): Promise<WriteWorkItemRanksResponse | null> =>
    fetch(target.url, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json-patch+json", Accept: "application/json" },
      body: JSON.stringify([{ op: "add", path: path, value: target.rank }]),
    }).then((response) => {
      if (response.ok) {
        written.push(target.id);
        return null;
      }
      const status = "HTTP " + String(response.status);
      return response.text().then(
        (body) => {
          failures.push(String(target.id) + ": " + status + ": " + body.slice(0, 200));
          return null;
        },
        () => {
          failures.push(String(target.id) + ": " + status);
          return null;
        },
      );
    });

  let chain: Promise<WriteWorkItemRanksResponse | null> = Promise.resolve(null);
  config.writes.forEach((target) => {
    chain = chain.then(() => writeOne(target));
  });

  return chain
    .then(() => ({
      ok: failures.length === 0,
      written: written,
      error: failures.length === 0 ? undefined : failures.join("; "),
    }))
    .catch((err) => ({ ok: false, written: written, error: String(err) }));
}
