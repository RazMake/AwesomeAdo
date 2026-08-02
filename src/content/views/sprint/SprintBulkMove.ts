import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { identityFieldValue } from "../../../common/ado/adoApi";
import type { ILogger } from "../../../common/logging/ILogger";

const ITERATION_PATH_FIELD = "System.IterationPath";
const STATE_FIELD = "System.State";
const AREA_PATH_FIELD = "System.AreaPath";
const ASSIGNED_TO_FIELD = "System.AssignedTo";
const DONE_COLUMN_ORDINAL = 3;
const DEFAULT_MAX_PASSES = 100;
const DEFAULT_MAX_ITEMS = 10_000;
const TRANSIENT_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 250;

export type SprintBulkMovePhase = "running" | "completed" | "cancelled" | "limited" | "failed";

export interface SprintBulkMoveProgress {
  phase: SprintBulkMovePhase;
  pass: number;
  moved: number;
  failed: number;
  skipped: number;
  examined: number;
  lastError?: string;
}

export interface SprintBulkMoveCandidate {
  id: number;
  areaPath: string | null;
  assigneeValue: string;
  assigneeLabel: string;
}

export interface SprintBulkMoveOptions {
  sourcePath: string;
  destinationPath: string;
  destinationName: string;
  candidates: readonly SprintBulkMoveCandidate[];
  types: readonly TypeCatalogEntry[];
  loadRoots(): Promise<readonly TrackedWorkItem[]>;
  writes: Pick<WorkItemWriteQueue, "enqueue">;
  cancelled(): boolean;
  wait(delayMs: number): Promise<void>;
  onProgress(progress: SprintBulkMoveProgress): void;
  logger: ILogger;
  limits?: { maxPasses: number; maxItems: number };
}

export function deliveryWorkTypes(types: readonly TypeCatalogEntry[]): ReadonlySet<string> {
  const workTypes = new Set(
    types.filter((type) => type.isPrimaryWork === true).map((type) => type.name),
  );
  const pending = [...workTypes];
  while (pending.length > 0) {
    const name = pending.pop() as string;
    for (const child of types.find((type) => type.name === name)?.children ?? []) {
      if (workTypes.has(child)) continue;
      workTypes.add(child);
      pending.push(child);
    }
  }
  return workTypes;
}

function flattenUnique(roots: readonly TrackedWorkItem[]): TrackedWorkItem[] {
  const found = new Map<number, TrackedWorkItem>();
  const pending = [...roots];
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined || found.has(item.id)) continue;
    found.set(item.id, item);
    pending.push(...item.children);
  }
  return [...found.values()];
}

export function sprintItemStateOrdinal(item: TrackedWorkItem, type: TypeCatalogEntry): number {
  return type.columns.findIndex((column) =>
    column.states.some((state) => state.toLocaleLowerCase() === item.state.toLocaleLowerCase()),
  );
}

function isStillEligible(
  item: TrackedWorkItem,
  candidate: SprintBulkMoveCandidate,
  type: TypeCatalogEntry | undefined,
  sourcePath: string,
): boolean {
  if (type?.isPrimaryWork !== true) return false;
  const ordinal = sprintItemStateOrdinal(item, type);
  const assignee = item.assignedTo === null ? null : identityFieldValue(item.assignedTo);
  return (
    item.iterationPath === sourcePath &&
    ordinal >= 0 &&
    ordinal < DONE_COLUMN_ORDINAL &&
    item.areaPath === candidate.areaPath &&
    assignee === candidate.assigneeValue
  );
}

function candidateItems(
  roots: readonly TrackedWorkItem[],
  candidates: ReadonlyMap<number, SprintBulkMoveCandidate>,
  remainingIds: ReadonlySet<number>,
  sourcePath: string,
  types: readonly TypeCatalogEntry[],
  skippedIds: Set<number>,
): TrackedWorkItem[] {
  const typeByName = new Map(types.map((type) => [type.name, type]));
  return flattenUnique(roots).filter((item) => {
    if (!remainingIds.has(item.id)) return false;
    const candidate = candidates.get(item.id);
    const type = typeByName.get(item.type);
    if (candidate === undefined) return false;
    const stillEligible = isStillEligible(item, candidate, type, sourcePath);
    if (!stillEligible) skippedIds.add(item.id);
    return stillEligible;
  });
}

function isTransient(error: string): boolean {
  const status = /HTTP\s+(\d+)/i.exec(error)?.[1];
  if (status !== undefined) {
    const code = Number(status);
    return code === 408 || code === 429 || code >= 500;
  }
  return /network|fetch|timeout|temporar|no response/i.test(error);
}

function isConflict(error: string): boolean {
  return /HTTP\s+(409|412)\b/i.test(error);
}

type MoveOutcome = "moved" | "defer" | "failed" | "cancelled";

async function moveOne(
  item: TrackedWorkItem,
  candidate: SprintBulkMoveCandidate,
  options: SprintBulkMoveOptions,
): Promise<{ outcome: MoveOutcome; error?: string }> {
  for (let attempt = 0; attempt <= TRANSIENT_RETRIES; attempt += 1) {
    if (options.cancelled()) return { outcome: "cancelled" };
    const result = await options.writes.enqueue({
      id: item.id,
      currentRev: () => item.rev,
      field: ITERATION_PATH_FIELD,
      value: options.destinationPath,
      baseValue: item.iterationPath,
      preconditions: [
        { field: STATE_FIELD, value: item.state },
        { field: AREA_PATH_FIELD, value: candidate.areaPath },
        { field: ASSIGNED_TO_FIELD, value: candidate.assigneeValue },
      ],
    });
    if (result.ok) {
      item.iterationPath = options.destinationPath;
      item.sprintName = options.destinationName;
      if (result.rev !== undefined) item.rev = result.rev;
      return { outcome: "moved" };
    }
    const error = result.error ?? "Unknown field-write failure";
    if (isConflict(error)) return { outcome: "defer", error };
    if (!isTransient(error) || attempt === TRANSIENT_RETRIES) {
      return { outcome: "failed", error };
    }
    await options.wait(INITIAL_RETRY_DELAY_MS * 2 ** attempt);
  }
  return { outcome: "failed", error: "Retry limit reached" };
}

interface BulkMoveRunState {
  candidates: ReadonlyMap<number, SprintBulkMoveCandidate>;
  remainingIds: Set<number>;
  movedIds: Set<number>;
  failedIds: Set<number>;
  skippedIds: Set<number>;
  examinedIds: Set<number>;
  lastError?: string;
}

function createRunState(candidates: readonly SprintBulkMoveCandidate[]): BulkMoveRunState {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return {
    candidates: byId,
    remainingIds: new Set(byId.keys()),
    movedIds: new Set<number>(),
    failedIds: new Set<number>(),
    skippedIds: new Set<number>(),
    examinedIds: new Set<number>(),
  };
}

function progress(
  state: BulkMoveRunState,
  phase: SprintBulkMovePhase,
  pass: number,
  lastError = state.lastError,
): SprintBulkMoveProgress {
  return {
    phase,
    pass,
    moved: state.movedIds.size,
    failed: state.failedIds.size,
    skipped: state.skippedIds.size,
    examined: state.examinedIds.size,
    lastError,
  };
}

function candidatesForPass(
  roots: readonly TrackedWorkItem[],
  state: BulkMoveRunState,
  options: SprintBulkMoveOptions,
): TrackedWorkItem[] {
  const presentIds = new Set(flattenUnique(roots).map((item) => item.id));
  for (const id of state.remainingIds) {
    if (!presentIds.has(id)) state.skippedIds.add(id);
  }
  const eligible = candidateItems(
    roots,
    state.candidates,
    state.remainingIds,
    options.sourcePath,
    options.types,
    state.skippedIds,
  );
  for (const id of state.skippedIds) state.remainingIds.delete(id);
  return eligible;
}

function recordOutcome(
  state: BulkMoveRunState,
  itemId: number,
  outcome: MoveOutcome,
  error?: string,
): void {
  state.lastError = error ?? state.lastError;
  if (outcome === "moved") state.movedIds.add(itemId);
  if (outcome === "failed") state.failedIds.add(itemId);
  if (outcome === "moved" || outcome === "failed") state.remainingIds.delete(itemId);
}

async function runPass(
  options: SprintBulkMoveOptions,
  state: BulkMoveRunState,
  pass: number,
): Promise<SprintBulkMoveProgress | null> {
  const eligible = candidatesForPass(await options.loadRoots(), state, options);
  if (state.remainingIds.size === 0) return progress(state, "completed", pass);
  for (const item of eligible) {
    state.examinedIds.add(item.id);
    const moved = await moveOne(item, state.candidates.get(item.id)!, options);
    if (moved.outcome === "cancelled") return progress(state, "cancelled", pass, moved.error);
    recordOutcome(state, item.id, moved.outcome, moved.error);
    options.onProgress(progress(state, "running", pass));
  }
  return state.remainingIds.size === 0 ? progress(state, "completed", pass) : null;
}

function reportCompletion(
  options: SprintBulkMoveOptions,
  result: SprintBulkMoveProgress,
): SprintBulkMoveProgress {
  options.onProgress(result);
  options.logger.info(
    `Sprint bulk move completed: moved=${result.moved}, failed=${result.failed}, skipped=${result.skipped}.`,
  );
  return result;
}

/** Move a changing past-sprint source until no eligible work remains or a requested guard stops it. */
export async function runSprintBulkMove(
  options: SprintBulkMoveOptions,
): Promise<SprintBulkMoveProgress> {
  const limits = options.limits ?? {
    maxPasses: DEFAULT_MAX_PASSES,
    maxItems: DEFAULT_MAX_ITEMS,
  };
  const state = createRunState(options.candidates);
  options.logger.info("Sprint bulk move started.");

  if (state.remainingIds.size > limits.maxItems) {
    const result = progress(state, "limited", 0);
    options.onProgress(result);
    options.logger.error("Sprint bulk move stopped at its item safety limit.");
    return result;
  }

  for (let pass = 1; pass <= limits.maxPasses; pass += 1) {
    if (options.cancelled()) {
      const result = progress(state, "cancelled", pass);
      options.onProgress(result);
      options.logger.info(
        `Sprint bulk move cancelled: moved=${result.moved}, failed=${result.failed}.`,
      );
      return result;
    }
    try {
      const result = await runPass(options, state, pass);
      if (result?.phase === "completed") return reportCompletion(options, result);
      if (result !== null) {
        options.onProgress(result);
        return result;
      }
    } catch (error) {
      options.logger.error("Sprint bulk move could not re-read its source", error);
      const reason = error instanceof Error ? error.message : String(error);
      const result = progress(state, "failed", pass, reason);
      options.onProgress(result);
      return result;
    }
  }

  const result = progress(state, "limited", limits.maxPasses);
  options.onProgress(result);
  options.logger.error("Sprint bulk move stopped at its pass safety limit.");
  return result;
}
