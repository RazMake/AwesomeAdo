import type { TeamConfigWriteResult } from "../settings-transfer/TeamConfigSynchronizer";

export interface WriteTeamConfigConfig {
  url: string;
  text: string;
}

/** Publishes the full configuration as one revision-guarded Description patch in ADO's MAIN world. */
export function writeTeamConfigInPage(
  config: WriteTeamConfigConfig,
): Promise<TeamConfigWriteResult> {
  type WorkItemSnapshot = { rev: number; description: unknown };

  function loadRevision(attempt: number): Promise<WorkItemSnapshot> {
    return fetch(config.url, {
      credentials: "include",
      headers: { Accept: "application/json", "X-TFS-FedAuthRedirect": "Suppress" },
    })
      .then((response): Promise<unknown> => {
        if (response.ok) return response.json();
        const failure = new Error("HTTP " + String(response.status)) as Error & {
          retryable: boolean;
        };
        failure.retryable =
          response.status === 408 || response.status === 429 || response.status >= 500;
        return Promise.reject(failure);
      })
      .catch((error): Promise<unknown> => {
        if ((error as { retryable?: unknown }).retryable === false || attempt >= 3)
          return Promise.reject(error);
        return new Promise((resolve) => setTimeout(resolve, 100 * attempt)).then(() =>
          loadRevision(attempt + 1),
        );
      })
      .then((body: unknown): WorkItemSnapshot => {
        const item = body as { rev?: unknown; fields?: Record<string, unknown> } | null;
        if (typeof item?.rev !== "number")
          throw new Error("Azure DevOps did not return the work item revision.");
        return { rev: item.rev, description: item.fields?.["System.Description"] };
      });
  }

  function publish(
    snapshot: WorkItemSnapshot,
    allowRebase: boolean,
  ): Promise<TeamConfigWriteResult> {
    const patch = [
      { op: "test", path: "/rev", value: snapshot.rev },
      {
        op: snapshot.description === undefined ? "add" : "replace",
        path: "/fields/System.Description",
        value: config.text,
      },
      {
        op: "add",
        path: "/multilineFieldsFormat/System.Description",
        value: "Markdown",
      },
    ];
    return fetch(config.url, {
      method: "PATCH",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json-patch+json",
        "X-TFS-FedAuthRedirect": "Suppress",
      },
      body: JSON.stringify(patch),
    }).then((response): Promise<TeamConfigWriteResult> | TeamConfigWriteResult => {
      if (response.ok) {
        return { ok: true };
      }
      if (response.status !== 412 || !allowRebase) {
        return { ok: false, error: "HTTP " + String(response.status) };
      }
      return loadRevision(1).then(
        (current): Promise<TeamConfigWriteResult> | TeamConfigWriteResult =>
          current.description === snapshot.description
            ? publish(current, false)
            : {
                ok: false,
                error: "HTTP 412 — team configuration changed since it was read",
              },
      );
    });
  }

  return loadRevision(1)
    .then((snapshot) => publish(snapshot, true))
    .catch((error): TeamConfigWriteResult => ({ ok: false, error: String(error) }));
}
