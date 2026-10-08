import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkItemCreateResult } from "../../../../common/ado/IWorkItemCreator";
import type { TrackedWorkItem, TypeCatalogEntry } from "../../../../common/ado/TrackedWorkItem";
import type { NewWorkItem } from "../../../../common/ado/createWorkItem";
import type { EnhancedViewServices } from "../../../../common/view-common/EnhancedView";
import type { ItemContextMenuCommand } from "../../../../common/view-common/control/ItemContextMenu/ItemContextMenu";

import {
  buildAddConsumerCommand,
  buildAddRequestCommand,
  consumerCreationCommands,
  type ConsumerCreationContext,
} from "./creationCommands";
import { formatNewConsumerDescription } from "./newConsumerDescription";

const CLIENT_ID = "11111111-2222-3333-4444-555555555555";
const NOT_CREATED = "Not created \u2014 see the diagnostics log.";
const NO_CONSUMER_TYPE =
  "No work item type is known for consumers: add the first consumer in Azure DevOps.";
const NO_REQUEST_TYPE =
  "No work item type is known for requests: add the first request in Azure DevOps.";

/** A tracked item carrying only what the commands read; each fixture overrides what it is about. */
function item(overrides: Partial<TrackedWorkItem> & { id: number }): TrackedWorkItem {
  return {
    rev: 1,
    type: "Request",
    title: `Item ${overrides.id}`,
    state: "Active",
    priority: null,
    assignedTo: null,
    areaPath: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "2026-07-01T00:00:00Z",
    createdBy: null,
    changedDate: "2026-07-01T00:00:00Z",
    changedBy: null,
    stateChangeDate: "2026-07-01T00:00:00Z",
    description: "",
    noteCount: 0,
    tags: [],
    importance: overrides.id,
    eta: null,
    children: [],
    ...overrides,
  };
}

function typeEntry(name: string, etaField: string | null = null): TypeCatalogEntry {
  return { name, color: "000000", icon: "i.svg", etaField, columns: [] };
}

/** A grouping item holding one consumer that already has one request, in Team A. */
function board(): { grouping: TrackedWorkItem; consumer: TrackedWorkItem } {
  const consumer = item({
    id: 2,
    type: "Consumer",
    title: "Contoso",
    areaPath: "Org\\Consumers",
    iterationPath: "Org\\Sprint 7",
    description: "- **ClientId**: `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`",
    children: [item({ id: 3, type: "Request", areaPath: "Org\\Team A" })],
  });
  const grouping = item({
    id: 1,
    type: "Group",
    title: "Consumers",
    areaPath: "Org\\Billing",
    iterationPath: "Org",
    children: [consumer],
  });
  return { grouping, consumer };
}

interface Harness {
  context: ConsumerCreationContext;
  create: ReturnType<typeof vi.fn<(item: NewWorkItem) => Promise<WorkItemCreateResult>>>;
  logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  onCreated: ReturnType<typeof vi.fn>;
}

function harness(
  grouping: TrackedWorkItem,
  types: ReadonlyMap<string, TypeCatalogEntry> = new Map(),
): Harness {
  const create = vi.fn<(item: NewWorkItem) => Promise<WorkItemCreateResult>>(async () => ({
    ok: true,
    id: 42,
  }));
  const logger = { info: vi.fn(), error: vi.fn() };
  const onCreated = vi.fn();
  const services = {
    createWorkItem: { create },
    logger,
    userDirectory: { search: async () => [], resolve: async () => null },
    attachmentUploader: { upload: vi.fn(), discard: vi.fn(async () => true) },
  } as unknown as EnhancedViewServices;
  return {
    context: { doc: document, services, grouping, types, configuredAreaPaths: [], onCreated },
    create,
    logger,
    onCreated,
  };
}

/** Open the command's panel in the document, returning it and its close spy. */
function openPanel(command: ItemContextMenuCommand) {
  const close = vi.fn();
  if (command.panel === undefined) throw new Error(`${command.label} has no panel`);
  const panel = command.panel(close);
  document.body.append(panel);
  return { panel, close };
}

function control<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`Nothing matches ${selector}`);
  return found;
}

function type(input: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input"));
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

/** Fill the consumer form's identity and click Add. */
async function addConsumer(panel: HTMLElement): Promise<void> {
  type(control(panel, ".awesomeado-new-consumer__service-name"), "Fabrikam");
  type(control(panel, ".awesomeado-new-consumer__client-id"), CLIENT_ID);
  control<HTMLButtonElement>(panel, ".awesomeado-new-consumer__add").click();
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("buildAddConsumerCommand — availability", () => {
  it("is disabled, saying why, when no consumer type can be determined", () => {
    const { context } = harness(item({ id: 1, type: "Group" }));

    const command = buildAddConsumerCommand(context);

    expect(command).toEqual({ label: "Add new consumer", disabledReason: NO_CONSUMER_TYPE });
  });

  it("opens the form in a centered panel headed by the grouping item", () => {
    const { context } = harness(board().grouping);

    const command = buildAddConsumerCommand(context);
    const { panel } = openPanel(command);

    expect(command.centerPanel).toBe(true);
    expect(panel.className).toBe("awesomeado-item-command__panel");
    expect(panel.style.width).toBe("640px");
    expect(panel.textContent).toContain("Parent: Consumers");
    expect(panel.querySelector(".awesomeado-new-consumer")).not.toBeNull();
    const scenario = panel.querySelector<HTMLTextAreaElement>(".awesomeado-new-consumer__scenario");
    expect(scenario?.placeholder).toContain("in which Billing will be called");
  });

  it("refuses a ClientId an existing consumer already states", () => {
    const { context } = harness(board().grouping);
    const { panel } = openPanel(buildAddConsumerCommand(context));

    type(control(panel, ".awesomeado-new-consumer__service-name"), "Fabrikam");
    type(
      control(panel, ".awesomeado-new-consumer__client-id"),
      "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
    );

    expect(control<HTMLButtonElement>(panel, ".awesomeado-new-consumer__add").disabled).toBe(true);
  });
});

describe("buildAddConsumerCommand — creating", () => {
  it("creates the consumer under the grouping item, then re-reads the board and closes", async () => {
    const { context, create, logger, onCreated } = harness(board().grouping);
    const { panel, close } = openPanel(buildAddConsumerCommand(context));

    await addConsumer(panel);

    expect(create).toHaveBeenCalledWith({
      type: "Consumer",
      title: "Fabrikam",
      tags: [],
      areaPath: "Org\\Billing",
      iterationPath: "Org",
      description: formatNewConsumerDescription({
        serviceName: "Fabrikam",
        clientId: CLIENT_ID,
        scenario: "",
        details: [],
        contacts: [],
      }),
      parentId: 1,
    });
    expect(logger.info).toHaveBeenCalledWith(
      'Consumers View added consumer 42 (Consumer) under 1 in area "Org\\Billing".',
    );
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("logs a created item with no id or area with placeholders", async () => {
    const { grouping } = board();
    const { context, create, logger } = harness({ ...grouping, areaPath: null });
    create.mockResolvedValue({ ok: true });
    const { panel } = openPanel(buildAddConsumerCommand(context));

    await addConsumer(panel);

    expect(logger.info).toHaveBeenCalledWith(
      'Consumers View added consumer ? (Consumer) under 1 in area "(default)".',
    );
  });
});

describe("buildAddConsumerCommand — failures", () => {
  it("logs a refused creation and keeps the form open with its failure line", async () => {
    const { context, create, logger, onCreated } = harness(board().grouping);
    create.mockResolvedValue({ ok: false, error: "TF401320: rule violated" });
    const { panel, close } = openPanel(buildAddConsumerCommand(context));

    await addConsumer(panel);

    expect(logger.error).toHaveBeenCalledWith(
      "Consumers View could not add a consumer (Consumer) under 1: TF401320: rule violated.",
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(control(panel, ".awesomeado-new-consumer__error").textContent).toBe(NOT_CREATED);
  });

  it("says no reason was given when a refusal carries none", async () => {
    const { context, create, logger } = harness(board().grouping);
    create.mockResolvedValue({ ok: false });
    const { panel } = openPanel(buildAddConsumerCommand(context));

    await addConsumer(panel);

    expect(logger.error).toHaveBeenCalledWith(
      "Consumers View could not add a consumer (Consumer) under 1: no reason given.",
    );
  });

  it("logs a thrown creation with the thrown value and keeps the form open", async () => {
    const { context, create, logger, onCreated } = harness(board().grouping);
    const failure = new Error("network down");
    create.mockRejectedValue(failure);
    const { panel, close } = openPanel(buildAddConsumerCommand(context));

    await addConsumer(panel);

    expect(logger.error).toHaveBeenCalledWith(
      "Consumers View failed to add a consumer under 1",
      failure,
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});

const ETA_TYPES: ReadonlyMap<string, TypeCatalogEntry> = new Map([
  ["Request", typeEntry("Request", "Custom.NeededBy")],
]);

/** Fill the request form's title (and date, when given) and click Add. */
async function addRequest(panel: HTMLElement, date: string | null): Promise<void> {
  type(control(panel, ".awesomeado-new-request__title"), "Raise the quota");
  if (date !== null) {
    control<HTMLInputElement>(panel, ".awesomeado-new-request__target-date").value = date;
  }
  control<HTMLButtonElement>(panel, ".awesomeado-new-request__add").click();
  await settle();
}

describe("buildAddRequestCommand — availability", () => {
  it("is disabled, saying why, when no request type can be determined", () => {
    const consumer = item({ id: 2, type: "Consumer" });
    const { context } = harness(item({ id: 1, type: "Group", children: [consumer] }));

    expect(buildAddRequestCommand(context, consumer)).toEqual({
      label: "Add new request",
      disabledReason: NO_REQUEST_TYPE,
    });
  });

  it("opens the form in a centered panel headed by the consumer", () => {
    const { grouping, consumer } = board();
    const { context } = harness(grouping, ETA_TYPES);

    const command = buildAddRequestCommand(context, consumer);
    const { panel } = openPanel(command);

    expect(command.centerPanel).toBe(true);
    expect(panel.textContent).toContain("Consumer: Contoso");
    const date = control<HTMLInputElement>(panel, ".awesomeado-new-request__target-date");
    expect(date.disabled).toBe(false);
  });

  it("disables the target date when the request type has no ETA field", () => {
    const { grouping, consumer } = board();
    const { context } = harness(grouping);

    const { panel } = openPanel(buildAddRequestCommand(context, consumer));

    const date = control<HTMLInputElement>(panel, ".awesomeado-new-request__target-date");
    expect(date.disabled).toBe(true);
    expect(date.title).toBe("Request has no ETA field configured.");
  });
});

describe("buildAddRequestCommand — creating", () => {
  it("creates the request under the consumer with its target date as the ETA", async () => {
    const { grouping, consumer } = board();
    const { context, create, logger, onCreated } = harness(grouping, ETA_TYPES);
    const { panel, close } = openPanel(buildAddRequestCommand(context, consumer));

    await addRequest(panel, "2026-11-01");

    expect(create).toHaveBeenCalledWith({
      type: "Request",
      title: "Raise the quota",
      tags: [],
      areaPath: "Org\\Team A",
      iterationPath: "Org\\Sprint 7",
      description: "",
      parentId: 2,
      extraFields: { "Custom.NeededBy": "2026-11-01T12:00:00Z" },
    });
    expect(logger.info).toHaveBeenCalledWith(
      'Consumers View added request 42 (Request) under 2 in area "Org\\Team A".',
    );
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("writes no extra field when no date was picked", async () => {
    const { grouping, consumer } = board();
    const { context, create } = harness(grouping, ETA_TYPES);
    const { panel } = openPanel(buildAddRequestCommand(context, consumer));

    await addRequest(panel, null);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ extraFields: null }));
  });

  it("writes no extra field when the request type has no ETA field", async () => {
    const { grouping, consumer } = board();
    const { context, create } = harness(grouping);
    const { panel } = openPanel(buildAddRequestCommand(context, consumer));

    await addRequest(panel, null);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ extraFields: null }));
  });
});

describe("consumerCreationCommands", () => {
  it("offers only Add new request, opening a new group", () => {
    const { grouping, consumer } = board();
    const { context } = harness(grouping);

    const commands = consumerCreationCommands(context, consumer);

    expect(commands.map((command) => command.label)).toEqual(["Add new request"]);
    expect(commands[0]?.separatorBefore).toBe(true);
  });
});
