/**
 * What a background-worker reply that carried no data actually means.
 *
 * Shared because every messaging client on the content side faces the same trap: a reply of
 * `undefined` means NO listener claimed the message, which reads as "no response from background"
 * and sends the reader looking for a network fault that is not there. Every worker listener here
 * answers even a malformed message with a reason, so the remaining causes are narrow and worth
 * naming — and naming them identically everywhere is what keeps one diagnosis from being better
 * worded than another.
 */

/** The explanation a reply with no data and no reason of its own gets. */
export const UNHANDLED_BY_WORKER =
  "the background worker did not handle the request — it is running older code than this page " +
  "(reload the extension, then the ADO tab) or failed to start (check the extension's service worker)";

/** The worker's own reason for a data-less reply, or the unhandled-message explanation. */
export function workerReplyProblem(response: { error?: string } | null | undefined): string {
  return response?.error ?? UNHANDLED_BY_WORKER;
}
