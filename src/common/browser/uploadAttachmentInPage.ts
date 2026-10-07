import type { UploadAttachmentConfig, UploadAttachmentResponse } from "./AttachmentUploadRequest";

/**
 * Upload one attachment from inside the ADO page's MAIN world.
 *
 * Runs there for the reason every credentialed write does (see `writeWorkItemNoteInPage`): only a
 * fetch in the ADO tab's own page world is both same-origin and carries the signed-in session. It is
 * injected via `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`, so it must reference only its parameter and page globals (`fetch`,
 * `atob`, `Uint8Array`) — no imports, no module scope, no async/await helpers.
 *
 * The bytes arrive as base64 because injection arguments must be JSON-serializable; they are decoded
 * back to raw bytes here, so ADO stores the image itself rather than its base64 text.
 */
export function uploadAttachmentInPage(
  config: UploadAttachmentConfig,
): Promise<UploadAttachmentResponse> {
  const failed = (error: string): UploadAttachmentResponse => ({ ok: false, error });
  let body: Uint8Array<ArrayBuffer>;
  try {
    const binary = atob(config.contentBase64);
    body = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      body[index] = binary.charCodeAt(index);
    }
  } catch (error) {
    return Promise.resolve(failed("invalid base64: " + String(error)));
  }

  return fetch(config.url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/octet-stream", Accept: "application/json" },
    body,
  })
    .then((response) => {
      if (!response.ok) {
        return failed("HTTP " + String(response.status));
      }
      return response.json().then(
        (raw: unknown): UploadAttachmentResponse => ({ ok: true, raw }),
        (error: unknown) => failed("invalid JSON: " + String(error)),
      );
    })
    .catch((error: unknown) => failed(String(error)));
}
