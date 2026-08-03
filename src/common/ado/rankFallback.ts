import { ADO_API_VERSION, IMPORTANCE_FIELD } from "./adoApi";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";

/**
 * The gap left between two consecutive ranks when this module has to assign them itself.
 *
 * Wide on purpose: every later drop that lands between two items takes the midpoint of their gap, so
 * a generous spacing buys many moves before the gap closes and the level has to be renumbered again.
 */
export const RANK_SPACING = 100000;

/** How many ids `_apis/wit/workitemsbatch` accepts in one request. */
const MAX_BATCH_IDS = 200;

/** One rank value to write onto one work item. */
export interface RankWrite {
  id: number;
  rank: number;
  /**
   * The item's `System.Rev` after the rank landed, when the write reported one.
   *
   * A rank write is a work item revision like any other, and a renumber rewrites the whole level —
   * so without this every sibling the user never touched is left holding a stale rev, and the next
   * edit to any of them is refused with HTTP 412 until the board reloads.
   */
  rev?: number;
}

/**
 * What has to be written to land the moved item where it was dropped.
 *
 * `reseeded` says whether the level had to be renumbered wholesale (the neighbours left no usable
 * gap) rather than the moved item alone being slotted in. It exists so the caller can log which of
 * the two happened: a renumber rewrites items the user never touched, which is worth being able to
 * see after the fact.
 */
export interface RankPlan {
  writes: RankWrite[];
  reseeded: boolean;
}

/**
 * Build the REST URL that reads a batch of work items, or null when `href` is not a project-scoped
 * ADO location. Project-scoped to match the tree loader's batch call, which the same session already
 * makes on every board load.
 */
export function buildWorkItemsBatchUrl(href: string): string | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const { base, project } = resolved;
  return `${base}/${project}/_apis/wit/workitemsbatch?api-version=${ADO_API_VERSION}`;
}

/**
 * Split `ids` into request-sized pages.
 *
 * The batch endpoint caps a request at 200 ids and simply rejects a longer one, so a level with more
 * siblings than that has to be read in pages or the whole fallback fails on a board nobody thought
 * would get that big.
 */
export function pageWorkItemIds(ids: readonly number[]): number[][] {
  const pages: number[][] = [];
  for (let start = 0; start < ids.length; start += MAX_BATCH_IDS) {
    pages.push(ids.slice(start, start + MAX_BATCH_IDS));
  }
  return pages;
}

/**
 * Read the rank each work item carries out of a `workitemsbatch` body, keyed by id.
 *
 * An item with no rank is deliberately ABSENT from the map rather than present with a zero: "not
 * placed on the backlog yet" is the state that makes this whole fallback necessary, and collapsing
 * it to a rank of 0 would sort those items to the very top and then rank later drops against a value
 * Azure DevOps never assigned. Numeric strings are accepted because ADO serializes the field as a
 * plain number for some processes and as a string for others.
 */
export function parseWorkItemRanks(body: unknown, field: string): Map<number, number> {
  const ranks = new Map<number, number>();
  const entries = Array.isArray(body) ? body : (body as { value?: unknown } | null)?.value;
  if (!Array.isArray(entries)) {
    return ranks;
  }
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const { id, fields } = entry as { id?: unknown; fields?: Record<string, unknown> };
    const rank = readRank(fields?.[field]);
    if (typeof id === "number" && rank !== null) {
      ranks.set(id, rank);
    }
  }
  return ranks;
}

/** A rank value as a finite number, or null when the field is empty or not a number. */
function readRank(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Work out the rank writes that put `movedId` where `siblingIds` says it now sits, or null when the
 * moved item is not in that list (the caller's view of the level is stale, so any rank computed from
 * it would be a guess).
 *
 * `siblingIds` is the level in its POST-drop order, so the item's neighbours are simply the entries
 * either side of it. One write is enough whenever those neighbours leave room between them; when
 * they do not — no ranks at all, or two ranks with nothing between them — the whole level is
 * renumbered at even spacing, anchored to the lowest rank it already had so a renumber does not yank
 * the group to the top of a backlog it was sitting in the middle of.
 */
export function planRankWrites(
  siblingIds: readonly number[],
  rankById: ReadonlyMap<number, number>,
  movedId: number,
): RankPlan | null {
  const index = siblingIds.indexOf(movedId);
  if (index < 0) {
    return null;
  }
  const landing = rankBetween(
    rankAt(siblingIds, index - 1, rankById),
    rankAt(siblingIds, index + 1, rankById),
  );
  if (landing !== null) {
    // An item dragged back onto the rank it already holds costs a work item revision for nothing,
    // so the write is dropped rather than sent.
    const writes = rankById.get(movedId) === landing ? [] : [{ id: movedId, rank: landing }];
    return { writes, reseeded: false };
  }
  return reseedLevel(siblingIds, rankById);
}

/** The rank of the sibling at `index`, or null when there is none or it carries no rank. */
function rankAt(
  siblingIds: readonly number[],
  index: number,
  rankById: ReadonlyMap<number, number>,
): number | null {
  const id = siblingIds[index];
  return id === undefined ? null : (rankById.get(id) ?? null);
}

/**
 * A rank that sits strictly between the two neighbours, or null when a single write cannot express
 * the drop and the level has to be renumbered instead.
 *
 * The gap must be at least 2 for a whole number to fit between two ranks; ADO's own backlog keeps
 * ranks whole, and a fractional rank would sort correctly today but shrink the gap for every later
 * drop until they collide. An item dropped at either end of the level needs no gap at all — it just
 * steps a full spacing past the only neighbour it has.
 */
function rankBetween(previous: number | null, next: number | null): number | null {
  if (previous !== null && next !== null) {
    return next - previous >= 2 ? Math.floor((previous + next) / 2) : null;
  }
  if (previous !== null) {
    return previous + RANK_SPACING;
  }
  if (next === null) {
    return null;
  }
  // Landing above the only neighbour: step a full spacing below it when there is room, otherwise
  // halve it. Both keep the new rank strictly LOWER than the neighbour's, which is what "above" means
  // on a backlog; a rank of 0 or less has no room to halve, so it takes the full step down.
  if (next > RANK_SPACING || next <= 0) {
    return next - RANK_SPACING;
  }
  return next / 2;
}

/** Renumber the whole level at even spacing, skipping items already at the value they need. */
function reseedLevel(
  siblingIds: readonly number[],
  rankById: ReadonlyMap<number, number>,
): RankPlan {
  const existing = siblingIds
    .map((id) => rankById.get(id))
    .filter((rank): rank is number => rank !== undefined);
  const base = existing.length > 0 ? Math.min(...existing) : RANK_SPACING;
  const writes: RankWrite[] = [];
  siblingIds.forEach((id, index) => {
    const target = base + index * RANK_SPACING;
    const current = rankById.get(id);
    // Skip an item already at (or within a rounding wobble of) its target: a renumber touches items
    // the user never dragged, and every skipped write is one fewer revision on somebody else's item.
    if (current === undefined || Math.abs(current - target) >= 1) {
      writes.push({ id, rank: target });
    }
  });
  return { writes, reseeded: true };
}

/** The outcome of ranking a level by hand: what was written, and the moved item's resulting rank. */
export interface RankFallbackResult {
  ok: boolean;
  /** The moved item's rank once the writes landed, when it is known. */
  order?: number;
  /** Every rank this fallback wrote, so the caller can refresh its in-memory copy of the level. */
  ranks?: RankWrite[];
  /** Whether the level had to be renumbered wholesale rather than the moved item alone placed. */
  reseeded?: boolean;
  error?: string;
}

/** Reads the current ranks of a page of work items; resolves with the raw batch body, or null. */
export type ReadRanks = (ids: readonly number[]) => Promise<unknown>;

/** Applies rank writes; resolves with whether they all landed, and the revisions they produced. */
export type WriteRanks = (
  writes: readonly RankWrite[],
) => Promise<{ ok: boolean; error?: string; revs?: readonly { id: number; rev: number }[] }>;

/**
 * Rank a level by writing the rank field directly, for the moves Azure DevOps' own backlog-order
 * endpoint refuses.
 *
 * WHY this exists: `_apis/work/workitemsorder` can only rank items that already hold a position on
 * the team's backlog. Items that carry no rank at all — and same-category parent/child nestings,
 * which Azure Boards does not order at all — make it answer `TF400486` ("you are trying to reorder an
 * item outside of its immediate parent"), permanently: retrying never helps, because there is nothing
 * for ADO to rank the item against. Writing the rank field is the same thing the backlog endpoint
 * would have done, minus its refusal, and it is the very field the board sorts "by importance" on, so
 * a drop that takes this path settles exactly where the user aimed.
 *
 * The two IO steps are injected rather than performed here (Dependency Inversion): the real calls
 * must run in the ADO tab's MAIN world to carry the session, and keeping them out means the decisions
 * — which ranks to read, what to write, what to report — stay ordinary unit-tested module code.
 */
export async function applyRankFallback(options: {
  /** The level in POST-drop order; every sibling, so a renumber cannot scramble hidden rows. */
  siblingIds: readonly number[];
  movedId: number;
  readRanks: ReadRanks;
  writeRanks: WriteRanks;
}): Promise<RankFallbackResult> {
  const { siblingIds, movedId } = options;
  const field = await readAllRanks(siblingIds, options.readRanks);
  const plan = planRankWrites(siblingIds, field, movedId);
  if (plan === null) {
    return { ok: false, error: `item ${movedId} is not among the siblings it was ranked against` };
  }
  const order = plan.writes.find((write) => write.id === movedId)?.rank ?? field.get(movedId);
  if (plan.writes.length === 0) {
    // Every sibling already holds the rank the drop implies — nothing to write, and reporting a
    // failure here would show a "couldn't save" badge for a board that is already correct.
    return { ok: true, order, ranks: [], reseeded: plan.reseeded };
  }
  const written = await options.writeRanks(plan.writes);
  if (!written.ok) {
    return { ok: false, error: written.error, reseeded: plan.reseeded };
  }
  return { ok: true, order, ranks: withRevs(plan.writes, written.revs), reseeded: plan.reseeded };
}

/** Attach the revision each write produced, so the caller can keep every renumbered item current. */
function withRevs(
  writes: readonly RankWrite[],
  revs: readonly { id: number; rev: number }[] | undefined,
): RankWrite[] {
  if (revs === undefined || revs.length === 0) {
    return [...writes];
  }
  const byId = new Map(revs.map((entry) => [entry.id, entry.rev]));
  return writes.map((write) => {
    const rev = byId.get(write.id);
    return rev === undefined ? write : { ...write, rev };
  });
}

/** Read every sibling's rank, one request-sized page at a time, merged into one map. */
async function readAllRanks(
  siblingIds: readonly number[],
  readRanks: ReadRanks,
): Promise<Map<number, number>> {
  const ranks = new Map<number, number>();
  for (const page of pageWorkItemIds(siblingIds)) {
    const body = await readRanks(page);
    for (const [id, rank] of parseWorkItemRanks(body, IMPORTANCE_FIELD)) {
      ranks.set(id, rank);
    }
  }
  return ranks;
}
