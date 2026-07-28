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
 *
 * `multilineFormat` (when supplied) adds the second patch operation ADO needs to store a multiline
 * field as Markdown rather than HTML. It is part of the SAME patch as the value: a field still on
 * `Html` stores Markdown source verbatim, so setting the format afterwards would leave one revision
 * of literal asterisks behind, and setting it in a separate request would cost a second rev the
 * optimistic-concurrency test would then have to be re-based on.
 */
export function updateWorkItemFieldInPage(
  updateUrl: string,
  id: number,
  rev: number,
  field: string,
  value: string | null,
  multilineFormat?: string,
): Promise<UpdateWorkItemFieldResponse> {
  const operations: { op: string; path: string; value?: unknown }[] = [
    { op: "test", path: "/rev", value: rev },
    value === null
      ? { op: "remove", path: "/fields/" + field }
      : { op: "add", path: "/fields/" + field, value: value },
  ];
  if (multilineFormat) {
    operations.push({
      op: "add",
      path: "/multilineFieldsFormat/" + field,
      value: multilineFormat,
    });
  }
  return fetch(updateUrl, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json-patch+json",
      Accept: "application/json",
    },
    body: JSON.stringify(operations),
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
