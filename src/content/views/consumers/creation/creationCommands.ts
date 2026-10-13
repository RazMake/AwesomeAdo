import type { WorkItemCreateResult } from "../../../../common/ado/IWorkItemCreator";
import type { TrackedWorkItem, TypeCatalogEntry } from "../../../../common/ado/TrackedWorkItem";
import type { NewWorkItem } from "../../../../common/ado/createWorkItem";
import type { EnhancedViewServices } from "../../../../common/view-common/EnhancedView";
import { etaValueOfPickedDate } from "../../../../common/view-common/control/EtaBadge/EtaBadge";
import type { FormSubmissionResult } from "../../../../common/view-common/control/FormLayout/FormLayout";
import type { ItemContextMenuCommand } from "../../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import { panelFor } from "../../project-tracking/item-commands/itemCommandCore";
import {
  PENDING_QUESTIONS_DESCRIPTION,
  PENDING_QUESTIONS_TAG,
  PENDING_QUESTIONS_TITLE,
  latestPendingQuestionsStory,
} from "../pendingQuestions";

import { renderNewConsumerForm } from "./NewConsumerForm";
import { renderNewQuestionForm, type NewQuestionValues } from "./NewQuestionForm";
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
const NO_PENDING_QUESTIONS_STORY = `This consumer has no "${PENDING_QUESTIONS_TITLE}" User Story tagged ${PENDING_QUESTIONS_TAG} to hold questions.`;
const PENDING_QUESTIONS_TYPE = "User Story";
const QUESTION_TYPE = "Task";
const PENDING_QUESTIONS_ITERATION = "O365 Core";
const PENDING_QUESTIONS_FAILURE =
  "The consumer was created, but its Pending Questions story was not. Close this form and add the story in Azure DevOps; see Diagnostics for details.";

function placementOf(item: NewWorkItem): string {
  if (item.parentId !== null && item.parentId !== undefined) return `under ${item.parentId}`;
  return "without a parent";
}

/**
 * Create one item.
 *
 * Only the type, ids and paths are logged: the title and description routinely name a customer, and
 * the diagnostics log travels with bug reports (AGENTS.md §9).
 */
async function createItem(
  context: ConsumerCreationContext,
  kind: "consumer" | "request" | "question" | "Pending Questions story",
  item: NewWorkItem,
): Promise<WorkItemCreateResult | null> {
  const { logger } = context.services;
  const placement = placementOf(item);
  try {
    const result = await context.services.createWorkItem.create(item);
    if (!result.ok) {
      logger.error(
        `Consumers View could not add a ${kind} (${item.type}) ${placement}: ` +
          `${result.error ?? "no reason given"}.`,
      );
      return null;
    }
    logger.info(
      `Consumers View added ${kind} ${result.id ?? "?"} (${item.type}) ${placement} ` +
        `in area "${item.areaPath ?? "(default)"}".`,
    );
    return result;
  } catch (error) {
    logger.error(`Consumers View failed to add a ${kind} ${placement}`, error);
    return null;
  }
}

async function createConsumer(
  context: ConsumerCreationContext,
  type: string,
  values: NewConsumerValues,
): Promise<FormSubmissionResult> {
  const { grouping } = context;
  const consumer = await createItem(context, "consumer", {
    type,
    title: values.serviceName,
    tags: [],
    areaPath: grouping.areaPath,
    iterationPath: grouping.iterationPath,
    description: formatNewConsumerDescription(values),
    parentId: grouping.id,
  });
  if (consumer === null) return false;
  if (consumer.id === undefined) {
    context.services.logger.error(
      "Consumers View created a consumer but received no id, so Pending Questions could not be added.",
    );
    return { accepted: false, failureMessage: PENDING_QUESTIONS_FAILURE, retryable: false };
  }
  const pendingQuestions = await createItem(context, "Pending Questions story", {
    type: PENDING_QUESTIONS_TYPE,
    title: PENDING_QUESTIONS_TITLE,
    tags: [PENDING_QUESTIONS_TAG],
    areaPath: grouping.areaPath,
    iterationPath: PENDING_QUESTIONS_ITERATION,
    description: PENDING_QUESTIONS_DESCRIPTION,
    parentId: consumer.id,
  });
  return pendingQuestions === null
    ? { accepted: false, failureMessage: PENDING_QUESTIONS_FAILURE, retryable: false }
    : true;
}

function createRequest(
  context: ConsumerCreationContext,
  consumer: TrackedWorkItem,
  type: string,
  values: NewRequestValues,
): Promise<boolean> {
  const etaField = context.types.get(type)?.etaField ?? null;
  return createItem(context, "request", {
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
  }).then((result) => result !== null);
}

/** A question is a Task filed where its Pending Questions story is, so it lands on that team's board. */
function createQuestion(
  context: ConsumerCreationContext,
  story: TrackedWorkItem,
  values: NewQuestionValues,
): Promise<boolean> {
  return createItem(context, "question", {
    type: QUESTION_TYPE,
    title: values.title,
    tags: [],
    areaPath: story.areaPath,
    iterationPath: story.iterationPath,
    description: values.description,
    parentId: story.id,
  }).then((result) => result !== null);
}

/**
 * Close the menu and re-read the board once the item exists; a refusal leaves the form open with
 * everything typed.
 */
function closingOnSuccess(
  context: ConsumerCreationContext,
  creation: Promise<boolean>,
  close: () => void,
): Promise<boolean> {
  return creation.then((created) => {
    if (created) {
      context.onCreated();
      close();
    }
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
    panel: (close) => {
      let reloadOnClose = false;
      const closeAndReload = (): void => {
        close();
        if (reloadOnClose) context.onCreated();
      };
      return panelFor(
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
            onSubmit: async (values) => {
              const result = await createConsumer(context, type, values);
              const accepted = typeof result === "boolean" ? result : result.accepted;
              if (accepted) {
                context.onCreated();
                close();
              } else if (typeof result !== "boolean" && !result.retryable) {
                reloadOnClose = true;
              }
              return result;
            },
            onCancel: closeAndReload,
          }),
        ],
      );
    },
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
              closingOnSuccess(context, createRequest(context, consumer, type, values), close),
            onCancel: close,
          }),
        ],
      ),
  };
}

/** "Add new question": a Task under the consumer's newest Pending Questions story. */
export function buildAddQuestionCommand(
  context: ConsumerCreationContext,
  consumer: TrackedWorkItem,
): ItemContextMenuCommand {
  const label = "Add new question";
  const story = latestPendingQuestionsStory(consumer);
  if (story === null) return { label, disabledReason: NO_PENDING_QUESTIONS_STORY };
  return {
    label,
    centerPanel: true,
    panel: (close) =>
      panelFor(
        context.doc,
        consumer,
        { withTitle: true, titlePrefix: "Consumer", widthPx: FORM_WIDTH_PX },
        [
          renderNewQuestionForm({
            doc: context.doc,
            userDirectory: context.services.userDirectory,
            attachmentUploader: context.services.attachmentUploader,
            logger: context.services.logger,
            onSubmit: (values) =>
              closingOnSuccess(context, createQuestion(context, story, values), close),
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
  return [
    { ...buildAddRequestCommand(context, consumer), separatorBefore: true },
    buildAddQuestionCommand(context, consumer),
  ];
}
