import type { TeamConfigReadResult } from "../settings-transfer/TeamConfigSynchronizer";

/** Reads the configuration Description inside the signed-in ADO page's MAIN world. */
export function fetchTeamConfigInPage(url: string): Promise<TeamConfigReadResult> {
  function unwrapFence(text: string): string {
    const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim());
    return (match?.[1] ?? text).trim();
  }

  function isJson(text: string): boolean {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }

  function configText(description: string): string {
    const trimmed = unwrapFence(description);
    if (isJson(trimmed)) {
      return trimmed;
    }
    // ADO can return multiline fields as rendered HTML even when they were authored as Markdown.
    // Parsing into an inert document removes its wrapper and decodes entities such as `&quot;`
    // without trying to predict which element ADO chose for the field.
    const parsed = new DOMParser().parseFromString(trimmed, "text/html");
    return unwrapFence(parsed.body.textContent ?? "");
  }

  function read(attempt: number): Promise<TeamConfigReadResult> {
    return fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json", "X-TFS-FedAuthRedirect": "Suppress" },
    })
      .then((response): Promise<TeamConfigReadResult> | TeamConfigReadResult => {
        const transient =
          response.status === 408 || response.status === 429 || response.status >= 500;
        if (!response.ok && transient && attempt < 3) {
          return new Promise((resolve) => setTimeout(resolve, attempt * 100)).then(() =>
            read(attempt + 1),
          );
        }
        if (!response.ok) {
          return { ok: false, error: "HTTP " + String(response.status) };
        }
        return response.json().then((body: unknown): TeamConfigReadResult => {
          const description = (body as { fields?: Record<string, unknown> } | null)?.fields?.[
            "System.Description"
          ];
          if (description === undefined || description === null || description === "") {
            return { ok: true, text: null };
          }
          if (typeof description !== "string") {
            return { ok: false, error: "The work item Description is not text." };
          }
          const text = configText(description);
          return { ok: true, text: text.length > 0 ? text : null };
        });
      })
      .catch((error): Promise<TeamConfigReadResult> | TeamConfigReadResult => {
        if (attempt >= 3) {
          return { ok: false, error: String(error) };
        }
        return new Promise((resolve) => setTimeout(resolve, attempt * 100)).then(() =>
          read(attempt + 1),
        );
      });
  }

  return read(1);
}
