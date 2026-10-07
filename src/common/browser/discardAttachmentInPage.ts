import type { DiscardAttachmentResponse } from "./AttachmentUploadRequest";

/**
 * Permanently delete one attachment from inside the ADO page's MAIN world.
 *
 * Runs there for the same reason the upload does (see `uploadAttachmentInPage`), and is serialized
 * the same way, so it references only its parameter and page globals.
 */
export function discardAttachmentInPage(url: string): Promise<DiscardAttachmentResponse> {
  return fetch(url, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  })
    .then((response): DiscardAttachmentResponse =>
      response.ok ? { ok: true } : { ok: false, error: "HTTP " + String(response.status) },
    )
    .catch((error: unknown): DiscardAttachmentResponse => ({ ok: false, error: String(error) }));
}
