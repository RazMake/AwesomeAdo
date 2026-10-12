import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import {
  stateTransitionRoute,
  type IWorkItemStateTransitionsReader,
  type WorkItemStateTransitions,
} from "../../../common/ado/WorkItemStateTransitions";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import type { ILogger } from "../../../common/logging/ILogger";

import { reflectAcceptedState } from "./itemStatusBadge";

export interface ChangeItemStateOptions {
  item: TrackedWorkItem;
  queue: WorkItemWriteQueue;
  /** The States the chosen status accepts, preferred first; the first is written when reachable. */
  targets: readonly string[];
  /** The type's allowed State changes; absent or unreadable means writing the first target directly. */
  transitions: IWorkItemStateTransitionsReader | undefined;
  logger: ILogger;
  now(): Date;
  /** Called once the item reached a target State. */
  onAccepted(): void;
  /** Called when a route stopped after an intermediary State landed, so the row can show it. */
  onStopped(): void;
}

/**
 * Moves an item to the chosen State, through whatever intermediary States its process requires.
 *
 * Each hop is its own guarded revision: ADO validates a State change against the item's CURRENT
 * State, so the intermediary must be committed before the next hop is allowed. Every hop waits for
 * the previous one so the queue reads the rev that hop produced.
 */
export async function changeItemState(options: ChangeItemStateOptions): Promise<void> {
  const { item, queue, logger } = options;
  const route = await planRoute(options);
  for (const [index, state] of route.entries()) {
    const result = await queue.enqueue({
      id: item.id,
      currentRev: () => item.rev,
      field: "System.State",
      value: state,
    });
    if (!result.ok || result.rev === undefined) {
      if (index > 0) {
        logger.error(
          `Item ${item.id} stopped in intermediary State "${item.state}": writing "${state}" ` +
            `on the way to "${route.at(-1)}" failed (${result.error ?? "no revision returned"}).`,
        );
        options.onStopped();
      }
      return;
    }
    reflectAcceptedState(item, state, result.rev, options.now);
  }
  options.onAccepted();
}

async function planRoute(options: ChangeItemStateOptions): Promise<readonly string[]> {
  const { item, targets, logger } = options;
  const direct = targets.slice(0, 1);
  const transitions = await loadTransitions(options);
  if (transitions === null) {
    logger.info(
      `Item ${item.id}: no "${item.type}" transition map; writing State "${direct[0]}" directly.`,
    );
    return direct;
  }
  for (const target of targets) {
    const route = stateTransitionRoute(transitions, item.state, target);
    if (route === null) continue;
    if (route.length > 1) {
      logger.info(
        `Item ${item.id}: "${item.type}" cannot go from "${item.state}" to "${target}" directly; ` +
          `writing ${route.map((state) => `"${state}"`).join(" → ")}.`,
      );
    }
    return route;
  }
  logger.info(
    `Item ${item.id}: no "${item.type}" route from "${item.state}" to ` +
      `${targets.map((state) => `"${state}"`).join(" / ")}; writing "${direct[0]}" directly.`,
  );
  return direct;
}

async function loadTransitions(
  options: ChangeItemStateOptions,
): Promise<WorkItemStateTransitions | null> {
  try {
    return (await options.transitions?.load(options.item.type)) ?? null;
  } catch (error) {
    options.logger.error(`Could not read "${options.item.type}" state transitions`, error);
    return null;
  }
}
