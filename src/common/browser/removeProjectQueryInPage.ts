/** What the MAIN-world remover is handed: the endpoints the worker resolved, and the link to find. */
export interface RemoveProjectQueryConfig {
  /** The project work item's own `_apis/wit/workitems/{id}` endpoint, for the unlink patch. */
  workItemUrl: string;
  /** The same item expanded with its relations, so the link is located immediately before removal. */
  relationsUrl: string;
  /** The project's last-known revision, used when the expanded read reports none. */
  rev: number;
  /** The exact hyperlink URL to remove — the query's own web address. */
  relationUrl: string;
  /** Stamped on links this extension created. */
  linkComment: string;
  /** The `_apis/wit/queries/{id}` endpoint the query itself is deleted through. */
  deleteQueryUrl: string;
}

/** Whether the query is gone, and the project's revision if the unlink advanced it. */
export interface RemoveProjectQueryOutcome {
  ok: boolean;
  rev?: number;
  error?: string;
}

/**
 * Delete a project's tracking query and then unlink it, from inside the ADO page's MAIN
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
 * WHY the link is located here rather than named by the caller: JSON Patch addresses a relation by
 * its INDEX, and an index read minutes ago on a board is exactly what a concurrent edit invalidates
 * — removing whatever now sits at that position. Reading and removing in one round trip keeps the
 * window in which that can happen as small as Azure DevOps allows.
 */
export function removeProjectQueryInPage(
  config: RemoveProjectQueryConfig,
): Promise<RemoveProjectQueryOutcome> {
  const linkIndexOf = (body: unknown): number => {
    const relations = (body as { relations?: unknown } | null)?.relations;
    const list: unknown[] = Array.isArray(relations) ? relations : [];
    return list.findIndex((candidate) => {
      const relation = candidate as { rel?: unknown; url?: unknown } | null;
      return (
        relation?.rel === "Hyperlink" &&
        typeof relation.url === "string" &&
        relation.url.replace(/\/+$/, "").toLowerCase() ===
          config.relationUrl.replace(/\/+$/, "").toLowerCase()
      );
    });
  };

  const deleteQuery = (
    index: number,
    rev: number,
    relationUrl: string,
  ): Promise<RemoveProjectQueryOutcome> =>
    fetch(config.deleteQueryUrl, { method: "DELETE", credentials: "include" }).then((response) =>
      // A query somebody already deleted is the state this command was asked to reach, so 404 is a
      // success rather than something to make the user retry.
      response.ok || response.status === 404
        ? index === -1
          ? { ok: true }
          : unlink(index, rev, relationUrl)
        : {
            ok: false,
            error:
              "could not delete the query; its link was retained: HTTP " + String(response.status),
          },
    );

  const unlink = (
    index: number,
    rev: number,
    relationUrl: string,
  ): Promise<RemoveProjectQueryOutcome> =>
    fetch(config.workItemUrl, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json-patch+json", Accept: "application/json" },
      body: JSON.stringify([
        { op: "test", path: "/rev", value: rev },
        { op: "test", path: "/relations/" + String(index) + "/url", value: relationUrl },
        { op: "remove", path: "/relations/" + String(index) },
      ]),
    }).then((response) => {
      if (!response.ok) {
        return {
          ok: false,
          error: "the query was deleted but could not be unlinked: HTTP " + String(response.status),
        };
      }
      return response.json().then((body: unknown) => ({
        ok: true,
        rev: (body as { rev?: number }).rev,
      }));
    });

  return fetch(config.relationsUrl, {
    credentials: "include",
    headers: { Accept: "application/json" },
  })
    .then((response) =>
      response.ok
        ? response.json()
        : Promise.reject(
            new Error("could not read the project's links: HTTP " + String(response.status)),
          ),
    )
    .then((body: unknown) => {
      const index = linkIndexOf(body);
      const rev = (body as { rev?: unknown } | null)?.rev;
      const relationUrl =
        index === -1
          ? config.relationUrl
          : (body as { relations: { url: string }[] }).relations[index]!.url;
      // A query nobody linked is still a query the user asked to delete, so a missing link is a step
      // to skip rather than a failure to report.
      return deleteQuery(index, typeof rev === "number" ? rev : config.rev, relationUrl);
    })
    .catch((error: unknown): RemoveProjectQueryOutcome => ({ ok: false, error: String(error) }));
}
