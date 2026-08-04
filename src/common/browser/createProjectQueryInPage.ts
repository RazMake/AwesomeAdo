/** What the MAIN-world writer is handed: the endpoints the worker resolved, plus the query to make. */
export interface CreateProjectQueryConfig {
  /** The `_apis/wit/queries/{folder}` endpoint the query is created in. */
  createQueryUrl: string;
  /** The tree WIQL the new query runs. */
  wiql: string;
  /** Names to try in order; the second exists because Azure DevOps refuses a duplicate name. */
  names: string[];
  /** Everything before the query id in the human-facing query URL the hyperlink carries. */
  webUrlPrefix: string;
  /** The two halves of the delete endpoint, so an orphaned query can be rolled back by id. */
  deleteUrlPrefix: string;
  deleteUrlSuffix: string;
  /** The project work item's own `_apis/wit/workitems/{id}` endpoint. */
  workItemUrl: string;
  /** The project's last-known revision, tested so a concurrent edit cannot be overwritten. */
  rev: number;
  /** Azure DevOps' name for a plain web link. */
  relationType: string;
  /** Stamped on the link so this extension's query can be told apart from a pasted URL. */
  linkComment: string;
}

/** The created query, or why the project still has none. */
export interface CreateProjectQueryOutcome {
  ok: boolean;
  queryId?: string;
  /** The project work item's revision after the link landed. */
  rev?: number;
  error?: string;
}

/**
 * Create a project's tracking query and hang it off the project, from inside the ADO page's MAIN
 * world.
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
 *
 * WHY both requests live in one injection: a query nobody can reach from the project is invisible
 * litter in a shared folder. Running the create and the link in one page-world round trip is what
 * lets the second failure roll the first one back.
 */
export function createProjectQueryInPage(
  config: CreateProjectQueryConfig,
): Promise<CreateProjectQueryOutcome> {
  const readBody = (response: Response): Promise<{ status: number; body: unknown }> =>
    response.json().then(
      (body: unknown) => ({ status: response.status, body: body }),
      () => ({ status: response.status, body: null }),
    );

  const attempt = (nameIndex: number): Promise<CreateProjectQueryOutcome> => {
    const name = config.names[nameIndex];
    if (name === undefined) {
      return Promise.resolve({ ok: false, error: "every candidate query name is already taken" });
    }
    return fetch(config.createQueryUrl, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: name, wiql: config.wiql }),
    })
      .then(readBody)
      .then((created) => {
        const id = (created.body as { id?: unknown } | null)?.id;
        if (created.status >= 200 && created.status < 300 && typeof id === "string") {
          return link(id);
        }
        // 400 is how ADO reports a name already used in the folder, so the next candidate is tried;
        // any other status is a real failure and is reported rather than retried under a new name.
        return created.status === 400
          ? attempt(nameIndex + 1)
          : { ok: false, error: "HTTP " + String(created.status) };
      });
  };

  const link = (queryId: string): Promise<CreateProjectQueryOutcome> =>
    fetch(config.workItemUrl, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json-patch+json", Accept: "application/json" },
      body: JSON.stringify([
        { op: "test", path: "/rev", value: config.rev },
        {
          op: "add",
          path: "/relations/-",
          value: {
            rel: config.relationType,
            url: config.webUrlPrefix + encodeURIComponent(queryId),
            attributes: { comment: config.linkComment },
          },
        },
      ]),
    })
      .then(readBody)
      .then((patched) => {
        if (patched.status < 200 || patched.status >= 300) {
          return rollback(queryId, patched.status);
        }
        const rev = (patched.body as { rev?: unknown } | null)?.rev;
        return { ok: true, queryId: queryId, rev: typeof rev === "number" ? rev : undefined };
      });

  // The rollback's own outcome is deliberately ignored: the caller is told about the failure that
  // matters, and a failed cleanup must not be reported in place of the cause.
  const rollback = (queryId: string, status: number): Promise<CreateProjectQueryOutcome> =>
    fetch(config.deleteUrlPrefix + encodeURIComponent(queryId) + config.deleteUrlSuffix, {
      method: "DELETE",
      credentials: "include",
    })
      .catch(() => undefined)
      .then(() => ({
        ok: false,
        error: "could not link the query to the project: HTTP " + String(status),
      }));

  return attempt(0).catch((error: unknown): CreateProjectQueryOutcome => ({
    ok: false,
    error: String(error),
  }));
}
