/**
 * The explanation inside an Azure DevOps refusal body.
 *
 * ADO answers a rejected write with a JSON envelope whose `message` is the actual cause ("TF401320:
 * Rule Error for field …", a stale rev). Non-JSON bodies (an HTML sign-in page after a session
 * expires) still surface verbatim, because they are the clue in exactly the cases where there is no
 * `message` to read.
 */
export function readAdoErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message.length > 0) {
      return parsed.message;
    }
  } catch {
    // Not JSON; the raw text is still the best clue there is.
  }
  return body;
}
