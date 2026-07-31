import type { TeamConfigWriteResult } from "../settings-transfer/TeamConfigSynchronizer";

export interface WriteTeamConfigConfig {
  url: string;
  text: string;
}

/** Publishes the full configuration as one revision-guarded Description patch in ADO's MAIN world. */
export function writeTeamConfigInPage(
  config: WriteTeamConfigConfig,
): Promise<TeamConfigWriteResult> {
  function loadRevision(attempt: number): Promise<unknown> {
    return fetch(config.url, {
      credentials: "include",
      headers: { Accept: "application/json", "X-TFS-FedAuthRedirect": "Suppress" },
    })
      .then((response): Promise<unknown> => {
        const retryable =
          response.status === 408 || response.status === 429 || response.status >= 500;
        if (!response.ok && retryable && attempt < 3) {
          return new Promise((resolve) => setTimeout(resolve, 100 * attempt)).then(() =>
            loadRevision(attempt + 1),
          );
        }
        if (response.ok) {
          return response.json();
        }
        const failure = new Error("HTTP " + String(response.status)) as Error & {
          retryable: boolean;
        };
        failure.retryable = false;
        return Promise.reject(failure);
      })
      .catch((error): Promise<unknown> => {
        if ((error as { retryable?: unknown }).retryable === false || attempt >= 3) {
          return Promise.reject(error);
        }
        return new Promise((resolve) => setTimeout(resolve, 100 * attempt)).then(() =>
          loadRevision(attempt + 1),
        );
      });
  }

  return loadRevision(1)
    .then((body: unknown): Promise<TeamConfigWriteResult> | TeamConfigWriteResult => {
      const item = body as { rev?: unknown; fields?: Record<string, unknown> } | null;
      if (typeof item?.rev !== "number") {
        return { ok: false, error: "Azure DevOps did not return the work item revision." };
      }
      const descriptionExists = item.fields?.["System.Description"] !== undefined;
      const patch = [
        { op: "test", path: "/rev", value: item.rev },
        {
          op: descriptionExists ? "replace" : "add",
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
      }).then((response): TeamConfigWriteResult =>
        response.ok ? { ok: true } : { ok: false, error: "HTTP " + String(response.status) },
      );
    })
    .catch((error): TeamConfigWriteResult => ({ ok: false, error: String(error) }));
}
