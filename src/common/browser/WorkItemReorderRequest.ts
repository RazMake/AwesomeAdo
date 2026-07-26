/**
 * The content→background message contract for moving a work item to a new position/parent.
 *
 * A content script runs in an isolated world whose origin is `chrome-extension://…`, so it cannot
 * fetch the credentialed ADO REST API itself (CORS-blocked, and a same-origin fetch from the
 * extension page would drop ADO's session cookies). Only the background service worker can run the
 * MAIN-world calls that carry the signed-in session, so the content side asks it to do so and hands
 * back the result. Keeping the message shape here means both ends agree on one contract instead of
 * drifting apart.
 */
export const REORDER_WORK_ITEM_MESSAGE = "awesomeado:reorder-work-item";

export interface ReorderWorkItemMessage {
  type: typeof REORDER_WORK_ITEM_MESSAGE;
  /** The work item being moved. */
  id: number;
  /** The item's last-known `System.Rev`, used as the concurrency guard on the re-parent patch. */
  rev: number;
  /** The parent the item must end up under; `0` for the top level. */
  parentId: number;
  /** The parent the item is under today; an equal `parentId` skips the link patch. */
  currentParentId: number;
  /** The sibling the item lands after; `0` places it first. */
  previousId: number;
  /** The sibling the item lands before; `0` places it last. */
  nextId: number;
  /** The team whose backlog order is being changed (ADO ranks per team). */
  team: string;
}

export interface ReorderWorkItemResponse {
  ok: boolean;
  order?: number;
  rev?: number;
  error?: string;
  /**
   * The raw body Azure DevOps returned with a rejected request, truncated.
   *
   * Carried separately from `error` because the page world that reads it must stay minimal (see
   * `reorderWorkItemInPage`): it hands back what the server said, and the worker — ordinary,
   * unit-testable module code — turns that into the sentence a human reads.
   */
  detail?: string;
}

/**
 * Fold a rejected reorder response into one human-readable sentence.
 *
 * Azure DevOps answers a refusal with a JSON body whose `message` is the actual explanation
 * ("TF401232: work item 123 does not exist", a rule violation, a stale rev). Preferring that over
 * the raw body — and over the bare status the page world reports — is what turns "order HTTP 400"
 * into something a reader can act on. Non-JSON bodies (an HTML sign-in page after a session
 * expires, an empty body) still surface verbatim, because they are the clue in exactly the cases
 * where there is no `message` to read.
 */
export function describeReorderFailure(response: ReorderWorkItemResponse): string {
  const status = response.error ?? "reorder failed";
  const body = (response.detail ?? "").trim();
  if (body.length === 0) {
    return `${status} (no response body)`;
  }
  let explanation = body;
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message.length > 0) {
      explanation = parsed.message;
    }
  } catch {
    // Not JSON; the raw text is still the best clue there is.
  }
  return `${status}: ${explanation}`;
}

/**
 * A work item id: a positive integer, since it is interpolated into REST URLs and JSON Patch bodies.
 */
function isWorkItemId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * A neighbour or parent reference: a work item id, or `0` — ADO's own sentinel for "no parent" /
 * "start of the list" / "end of the list". Anything else (a negative number, a fraction) cannot name
 * a real item and must not reach the worker, which interpolates these into URLs it then calls with
 * the user's session.
 */
function isWorkItemIdOrNone(value: unknown): value is number {
  return value === 0 || isWorkItemId(value);
}

/**
 * Why the message's work item references are unusable, or null when they are all fine. Split from
 * the main check so neither grows into one long conjunction where a dropped clause is easy to miss.
 */
function idProblem(candidate: Partial<ReorderWorkItemMessage>): string | null {
  if (!isWorkItemId(candidate.id)) {
    return `id ${describeValue(candidate.id)} is not a positive integer work item id`;
  }
  for (const field of ["parentId", "currentParentId", "previousId", "nextId"] as const) {
    if (!isWorkItemIdOrNone(candidate[field])) {
      return `${field} ${describeValue(candidate[field])} is not a work item id or 0`;
    }
  }
  return null;
}

/**
 * Why `value` is not a usable reorder request, or null when it is one.
 *
 * A *reason* rather than a bare boolean because the worker's listeners are type-guarded: a message
 * that fails validation is simply ignored, and an ignored message reaches the content side as the
 * uninformative "no response from background" — indistinguishable from a worker that has no handler
 * at all. Naming the offending field turns that dead end into a diagnosis.
 */
export function reorderMessageProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return "message is not an object";
  }
  const candidate = value as Partial<ReorderWorkItemMessage>;
  if (candidate.type !== REORDER_WORK_ITEM_MESSAGE) {
    return `type is "${String(candidate.type)}", expected "${REORDER_WORK_ITEM_MESSAGE}"`;
  }
  const ids = idProblem(candidate);
  if (ids !== null) {
    return ids;
  }
  // A rev is a monotonically increasing revision count, so a negative one cannot describe any real
  // item; rejecting it here keeps a nonsense `test /rev` operation from ever reaching ADO.
  if (typeof candidate.rev !== "number" || !Number.isInteger(candidate.rev) || candidate.rev < 0) {
    return `rev ${describeValue(candidate.rev)} is not a non-negative integer`;
  }
  if (typeof candidate.team !== "string" || candidate.team.trim().length === 0) {
    return "team is missing or blank (no team is configured in AwesomeADO options)";
  }
  return null;
}

/** A value rendered for a log line: quoted when a string, so an empty one is not invisible. */
function describeValue(value: unknown): string {
  return typeof value === "string" ? `"${value}"` : String(value);
}

export function isReorderWorkItemMessage(value: unknown): value is ReorderWorkItemMessage {
  return reorderMessageProblem(value) === null;
}
