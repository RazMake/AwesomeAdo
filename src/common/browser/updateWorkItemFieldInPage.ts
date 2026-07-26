import type { UpdateWorkItemFieldResponse } from "./WorkItemFieldRequest";

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
 * A `null` value clears the field (JSON Patch `remove`); any other value sets it (`add`).
 */
export function updateWorkItemFieldInPage(
  updateUrl: string,
  id: number,
  rev: number,
  field: string,
  value: string | null,
): Promise<UpdateWorkItemFieldResponse> {
  const fieldOp =
    value === null
      ? { op: "remove", path: "/fields/" + field }
      : { op: "add", path: "/fields/" + field, value: value };
  return fetch(updateUrl, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json-patch+json",
      Accept: "application/json",
    },
    body: JSON.stringify([{ op: "test", path: "/rev", value: rev }, fieldOp]),
  })
    .then((response) => {
      if (response.ok) {
        return response.json().then((json) => {
          const typedJson = json as { rev?: unknown };
          const newRev = typedJson.rev;
          const result: UpdateWorkItemFieldResponse = {
            ok: true,
            rev: typeof newRev === "number" ? newRev : undefined,
          };
          return result;
        });
      }
      const result: UpdateWorkItemFieldResponse = {
        ok: false,
        error: "HTTP " + String(response.status),
      };
      return result;
    })
    .catch((err) => {
      const result: UpdateWorkItemFieldResponse = { ok: false, error: String(err) };
      return result;
    });
}
