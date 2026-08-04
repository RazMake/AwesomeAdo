import type { IQueryBindingStore } from "../bindings/IQueryBindingStore";
import type { IQueryBindingWriter } from "../bindings/IQueryBindingWriter";
import type { QueryBinding, QueryBindings } from "../bindings/QueryBinding";
import type { ILogger } from "../logging/ILogger";

import type { TeamConfigSynchronizer, TeamConfigWriter } from "./TeamConfigSynchronizer";

/**
 * Binds and unbinds ONE query against the team-shared configuration as well as this device.
 *
 * A purely local mutation is not durable while a team is connected: the shared work item still
 * lists the old map, and the next pull replaces the local one with it. For a project whose tracking
 * query was deleted on completion that means the binding returns — and returns again after every
 * pull — so the shared configuration accumulates permanent entries for queries nobody can open.
 */
export class TeamSharedQueryBindingWriter implements IQueryBindingWriter {
  constructor(
    private readonly bindings: IQueryBindingStore,
    private readonly synchronizer: TeamConfigSynchronizer,
    private readonly writer: TeamConfigWriter,
    private readonly logger: ILogger,
  ) {}

  bind(queryId: string, binding: QueryBinding): Promise<void> {
    return this.publishThenApply(
      queryId,
      (current) => ({ ...current, [queryId]: binding }),
      () => this.bindings.bind(queryId, binding),
    );
  }

  unbind(queryId: string): Promise<void> {
    return this.publishThenApply(
      queryId,
      (current) => withoutQuery(current, queryId),
      () => this.bindings.unbind(queryId),
    );
  }

  /**
   * Publish the whole proposed map first, then mutate locally — never the other way round.
   *
   * A local change made observable before the work item accepted it is undone by the very next
   * pull, which is exactly how a removed binding reappears. A publish that fails therefore leaves
   * local state untouched, so the two never disagree about which queries the team enhances.
   */
  private async publishThenApply(
    queryId: string,
    propose: (current: QueryBindings) => QueryBindings,
    applyLocally: () => Promise<void>,
  ): Promise<void> {
    const proposed = propose(await this.bindings.read());
    const result = await this.synchronizer.publishBindings(this.writer, proposed);
    if (result.status === "failed") {
      this.logger.error(
        `Left the binding for query ${queryId} unchanged: the team configuration refused the change`,
        result.error,
      );
      return;
    }
    await applyLocally();
  }
}

/** The map without one query. Spread copies own keys, so a `__proto__` key stays inert data. */
function withoutQuery(bindings: QueryBindings, queryId: string): QueryBindings {
  const next = { ...bindings };
  delete next[queryId];
  return next;
}
