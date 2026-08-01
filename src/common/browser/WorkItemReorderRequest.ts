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
  /**
   * The destination level in its POST-drop order — every sibling, including rows a filter hides.
   *
   * Sent because ADO's backlog-order endpoint refuses to rank items that hold no backlog position at
   * all, and the fallback that ranks them by hand has to see the level the user ended up with. The
   * worker cannot derive it: only the board knows the tree.
   */
  siblingIds: number[];
  /** The destination parent's default child type, when the hierarchy move also converts the item. */
  typeName?: string;
  /** The destination column's primary ADO state, when the move also changes application state. */
  stateName?: string;
  /** The state observed before the move, used only to authorize a conflict-safe rev rebase. */
  stateBaseName?: string;
  /** The team whose backlog order is being changed (ADO ranks per team). */
  team: string;
}

/** Which call of the move was in flight when it failed; absent on success. */
export type ReorderStage = "state" | "relations" | "reparent" | "order";

export interface ReorderWorkItemResponse {
  ok: boolean;
  order?: number;
  rev?: number;
  error?: string;
  /**
   * Which call failed, so the caller can tell a refusal to RANK the item apart from a failure to
   * re-link it. Only the first is worth falling back from: a move whose re-parent never landed has
   * nothing to rank, because the item is not among the siblings it was ranked against.
   */
  stage?: ReorderStage;
  /**
   * Whether the hierarchy link was actually changed. Reported even on failure so a move that
   * re-parented the item and then failed to rank it is not mistaken for one that changed nothing —
   * a board that keeps showing the old parent would send the same doomed request forever.
   */
  reparented?: boolean;
  /** Whether the optional state patch landed before a later order failure. */
  stateChanged?: boolean;
  /**
   * Every rank the worker wrote directly, when Azure DevOps refused to order the item itself.
   * Placing one item can renumber its whole level, so this names each item whose rank changed.
   */
  ranks?: readonly { id: number; rank: number }[];
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
 * The Azure DevOps error code for "I will not rank this item", and the plain-English reason for it.
 *
 * `TF400486` reads as a concurrency complaint ("you or another user has modified… items"), which
 * sends a reader hunting for a race that is not there. It is in fact what ADO answers whenever the
 * item has no position on the team's backlog to rank against — items that carry no rank at all, and
 * same-category nestings (a User Story under a User Story), which Azure Boards documents as not
 * orderable at all. Retrying can never clear it, so the log has to say so or the next reader spends
 * the afternoon on the wrong theory.
 */
const SAME_LEVEL_REFUSAL = "TF400486";

/**
 * A plain-English explanation of a refusal the log should carry beside ADO's own words, or null when
 * there is nothing to add beyond what Azure DevOps already said.
 */
export function explainReorderRefusal(reason: string): string | null {
  if (!reason.includes(SAME_LEVEL_REFUSAL)) {
    return null;
  }
  return (
    "Azure DevOps will not rank this item on the team backlog: it has no backlog position to rank " +
    "against, which happens when the item carries no rank yet or sits under a parent of its own " +
    "category (a User Story under a User Story). This is not a concurrency problem and retrying " +
    "cannot clear it \u2014 the rank is written directly instead. " +
    "See https://learn.microsoft.com/azure/devops/boards/backlogs/resolve-backlog-reorder-issues"
  );
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
 * Why the message's non-id fields are unusable, or null when they are all fine. Split from
 * `reorderMessageProblem` for the same reason `idProblem` is: neither should grow into one long
 * chain where a dropped clause hides among the others.
 */
function detailProblem(candidate: Partial<ReorderWorkItemMessage>): string | null {
  // A rev is a monotonically increasing revision count, so a negative one cannot describe any real
  // item; rejecting it here keeps a nonsense `test /rev` operation from ever reaching ADO.
  if (typeof candidate.rev !== "number" || !Number.isInteger(candidate.rev) || candidate.rev < 0) {
    return `rev ${describeValue(candidate.rev)} is not a non-negative integer`;
  }
  if (typeof candidate.team !== "string" || candidate.team.trim().length === 0) {
    return "team is missing or blank (no team is configured in AwesomeADO options)";
  }
  const typeProblem = workItemTypeProblem(candidate.typeName);
  if (typeProblem !== null) {
    return typeProblem;
  }
  const stateProblem = reorderStateProblem(candidate);
  if (stateProblem !== null) {
    return stateProblem;
  }
  // The sibling order is what the hand-written ranking falls back to, and every entry becomes a URL
  // the worker then calls with the user's session, so it is validated as strictly as the ids above.
  if (!Array.isArray(candidate.siblingIds) || !candidate.siblingIds.every(isWorkItemId)) {
    return "siblingIds is not an array of positive integer work item ids";
  }
  return null;
}

/** Why the optional state change and its conflict-rebase value cannot travel together. */
function reorderStateProblem(candidate: Partial<ReorderWorkItemMessage>): string | null {
  return (
    stateNameProblem(candidate.stateName) ??
    stateBaseNameProblem(candidate.stateBaseName, candidate.stateName)
  );
}

/** Why an optional destination type cannot name an ADO work-item type. */
function workItemTypeProblem(value: unknown): string | null {
  if (value === undefined || (typeof value === "string" && value.trim().length > 0)) {
    return null;
  }
  return `typeName ${describeValue(value)} is not a non-blank work item type`;
}

/** Why an optional application state cannot be sent to `System.State`. */
function stateNameProblem(value: unknown): string | null {
  if (value === undefined || (typeof value === "string" && value.trim().length > 0)) {
    return null;
  }
  return `stateName ${describeValue(value)} is not a non-blank ADO state`;
}

/** Why the optional state-rebase value cannot safely accompany this request. */
function stateBaseNameProblem(value: unknown, stateName: unknown): string | null {
  if (value === undefined) return null;
  if (stateName === undefined) return "stateBaseName cannot be supplied without stateName";
  if (typeof value === "string" && value.trim().length > 0) return null;
  return `stateBaseName ${describeValue(value)} is not a non-blank ADO state`;
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
  return idProblem(candidate) ?? detailProblem(candidate);
}

/** A value rendered for a log line: quoted when a string, so an empty one is not invisible. */
function describeValue(value: unknown): string {
  return typeof value === "string" ? `"${value}"` : String(value);
}

export function isReorderWorkItemMessage(value: unknown): value is ReorderWorkItemMessage {
  return reorderMessageProblem(value) === null;
}
