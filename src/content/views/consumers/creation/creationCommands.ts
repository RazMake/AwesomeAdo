import type { TrackedWorkItem, TypeCatalogEntry } from "../../../../common/ado/TrackedWorkItem";
import type { NewWorkItem } from "../../../../common/ado/createWorkItem";
import type { EnhancedViewServices } from "../../../../common/view-common/EnhancedView";
import { etaValueOfPickedDate } from "../../../../common/view-common/control/EtaBadge/EtaBadge";
import type { ItemContextMenuCommand } from "../../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import { panelFor } from "../../project-tracking/item-commands/itemCommandCore";

import { renderNewConsumerForm } from "./NewConsumerForm";
import { renderNewRequestForm, type NewRequestValues } from "./NewRequestForm";
import {
  calledServiceName,
  knownClientIds,
  newConsumerType,
  newRequestAreaPath,
  newRequestType,
} from "./creationDefaults";
import { formatNewConsumerDescription, type NewConsumerValues } from "./newConsumerDescription";

/** What the creation commands need from the board they were opened on. */
export interface ConsumerCreationContext {
  doc: Document;
  services: EnhancedViewServices;
  /** The query's hidden root, which every consumer is a child of. */
  grouping: TrackedWorkItem;
  types: ReadonlyMap<string, TypeCatalogEntry>;
  /** The binding's request area branches, which decide where a new request is filed. */
  configuredAreaPaths: readonly string[];
  /** Re-read the query, so the new item appears wherever the query places it. */
  onCreated(): void;
}

/** Wide enough for a contact's name, alias and role on one line. */
const FORM_WIDTH_PX = 640;

const NO_CONSUMER_TYPE =
  "No work item type is known for consumers: add the first consumer in Azure DevOps.";
const NO_REQUEST_TYPE =
  "No work item type is known for requests: add the first request in Azure DevOps.";

/**
 * Create one item and re-read the board on success.
 *
 * Only the type, ids and paths are logged: the title and description routinely name a customer, and
 * the diagnostics log travels with bug reports (AGENTS.md §9).
 */
async function createChild(
  context: ConsumerCreationContext,
  kind: "consumer" | "request",
  item: NewWorkItem,
): Promise<boolean> {
  const { logger } = context.services;
  try {
    const result = await context.services.createWorkItem.create(item);
    if (!result.ok) {
      logger.error(
        `Consumers View could not add a ${kind} (${item.type}) under ${item.parentId ?? "?"}: ` +
          `${result.error ?? "no reason given"}.`,
      );
      return false;
    }
    logger.info(
      `Consumers View added ${kind} ${result.id ?? "?"} (${item.type}) under ${item.parentId ?? "?"} ` +
        `in area "${item.areaPath ?? "(default)"}".`,
    );
  } catch (error) {
    logger.error(`Consumers View failed to add a ${kind} under ${item.parentId ?? "?"}`, error);
    return false;
  }
  context.onCreated();
  return true;
}

function createConsumer(
  context: ConsumerCreationContext,
  type: string,
  values: NewConsumerValues,
): Promise<boolean> {
  const { grouping } = context;
  return createChild(context, "consumer", {
    type,
    title: values.serviceName,
    tags: [],
    areaPath: grouping.areaPath,
    iterationPath: grouping.iterationPath,
    description: formatNewConsumerDescription(values),
    parentId: grouping.id,
  });
}

function createRequest(
  context: ConsumerCreationContext,
  consumer: TrackedWorkItem,
  type: string,
  values: NewRequestValues,
): Promise<boolean> {
  const etaField = context.types.get(type)?.etaField ?? null;
  return createChild(context, "request", {
    type,
    title: values.title,
    tags: [],
    areaPath: newRequestAreaPath(context.grouping, consumer, context.configuredAreaPaths),
    iterationPath: consumer.iterationPath,
    description: values.description,
    parentId: consumer.id,
    extraFields:
      etaField !== null && values.targetDate !== null
        ? { [etaField]: etaValueOfPickedDate(values.targetDate) }
        : null,
  });
}

/** Close the menu once the item exists; a refusal leaves the form open with everything typed. */
function closingOnSuccess(creation: Promise<boolean>, close: () => void): Promise<boolean> {
  return creation.then((created) => {
    if (created) close();
    return created;
  });
}

/** "Add new consumer": a consumer under the query's grouping item. */
export function buildAddConsumerCommand(context: ConsumerCreationContext): ItemContextMenuCommand {
  const label = "Add new consumer";
  const type = newConsumerType(context.grouping, context.types);
  if (type === null) return { label, disabledReason: NO_CONSUMER_TYPE };
  return {
    label,
    centerPanel: true,
    panel: (close) =>
      panelFor(
        context.doc,
        context.grouping,
        { withTitle: true, titlePrefix: "Parent", widthPx: FORM_WIDTH_PX },
        [
          renderNewConsumerForm({
            doc: context.doc,
            userDirectory: context.services.userDirectory,
            logger: context.services.logger,
            calledService: calledServiceName(context.grouping),
            knownClientIds: knownClientIds(context.grouping),
            onSubmit: (values) => closingOnSuccess(createConsumer(context, type, values), close),
            onCancel: close,
          }),
        ],
      ),
  };
}

/** "Add new request": a request under the right-clicked consumer. */
export function buildAddRequestCommand(
  context: ConsumerCreationContext,
  consumer: TrackedWorkItem,
): ItemContextMenuCommand {
  const label = "Add new request";
  const type = newRequestType(context.grouping, consumer, context.types);
  if (type === null) return { label, disabledReason: NO_REQUEST_TYPE };
  const etaField = context.types.get(type)?.etaField ?? null;
  return {
    label,
    centerPanel: true,
    panel: (close) =>
      panelFor(
        context.doc,
        consumer,
        { withTitle: true, titlePrefix: "Consumer", widthPx: FORM_WIDTH_PX },
        [
          renderNewRequestForm({
            doc: context.doc,
            userDirectory: context.services.userDirectory,
            attachmentUploader: context.services.attachmentUploader,
            logger: context.services.logger,
            targetDateUnavailable:
              etaField === null ? `${type} has no ETA field configured.` : null,
            onSubmit: (values) =>
              closingOnSuccess(createRequest(context, consumer, type, values), close),
            onCancel: close,
          }),
        ],
      ),
  };
}

/** The creation commands a consumer row's menu offers, opening a new group. */
export function consumerCreationCommands(
  context: ConsumerCreationContext,
  consumer: TrackedWorkItem,
): ItemContextMenuCommand[] {
  return [{ ...buildAddRequestCommand(context, consumer), separatorBefore: true }];
}
