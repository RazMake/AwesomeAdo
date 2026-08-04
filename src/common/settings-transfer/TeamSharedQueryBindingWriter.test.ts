import { describe, expect, it, vi } from "vitest";

import type { IQueryBindingStore } from "../bindings/IQueryBindingStore";
import type { QueryBinding, QueryBindings } from "../bindings/QueryBinding";
import type { ILogger } from "../logging/ILogger";

import type {
  TeamConfigSyncResult,
  TeamConfigSynchronizer,
  TeamConfigWriter,
} from "./TeamConfigSynchronizer";
import { TeamSharedQueryBindingWriter } from "./TeamSharedQueryBindingWriter";

const BINDING: QueryBinding = { view: "project-tracking", properties: {} };
const EXISTING: QueryBindings = { keep: { view: "sprint", properties: {} } };

function harness(
  publish: TeamConfigSyncResult = { status: "published", workItemId: 7, bindingCount: 0 },
) {
  const bindings = {
    read: vi.fn(async (): Promise<QueryBindings> => ({ ...EXISTING, drop: BINDING })),
    bind: vi.fn(async () => undefined),
    unbind: vi.fn(async () => undefined),
  } as unknown as IQueryBindingStore;
  const publishBindings = vi.fn(async () => publish);
  const synchronizer = { publishBindings } as unknown as TeamConfigSynchronizer;
  const writer: TeamConfigWriter = { write: vi.fn() };
  const logger: ILogger = { info: vi.fn(), error: vi.fn() };
  return {
    bindings,
    publishBindings,
    logger,
    subject: new TeamSharedQueryBindingWriter(bindings, synchronizer, writer, logger),
  };
}

describe("TeamSharedQueryBindingWriter", () => {
  it("publishes the map with the new binding before recording it locally", async () => {
    const { bindings, publishBindings, subject } = harness();

    await subject.bind("added", BINDING);

    expect(publishBindings).toHaveBeenCalledWith(expect.anything(), {
      ...EXISTING,
      drop: BINDING,
      added: BINDING,
    });
    expect(bindings.bind).toHaveBeenCalledWith("added", BINDING);
    expect(publishBindings.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(bindings.bind).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("publishes the map without the query before dropping it locally", async () => {
    const { bindings, publishBindings, subject } = harness();

    await subject.unbind("drop");

    expect(publishBindings).toHaveBeenCalledWith(expect.anything(), EXISTING);
    expect(bindings.unbind).toHaveBeenCalledWith("drop");
    expect(publishBindings.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(bindings.unbind).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("still mutates locally when no team configuration is connected", async () => {
    const { bindings, subject } = harness({ status: "disconnected" });

    await subject.unbind("drop");

    expect(bindings.unbind).toHaveBeenCalledWith("drop");
  });

  it("leaves the binding alone and logs when the shared configuration refuses the change", async () => {
    const { bindings, logger, subject } = harness({
      status: "failed",
      workItemId: 7,
      error: "conflict",
    });

    await subject.unbind("drop");

    expect(bindings.unbind).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("drop"), "conflict");
  });
});
