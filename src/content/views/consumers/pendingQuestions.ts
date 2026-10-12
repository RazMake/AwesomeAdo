import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import { hasWorkItemTag } from "../../../common/ado/workItemTags";

export const PENDING_QUESTIONS_TITLE = "Pending Questions";
export const PENDING_QUESTIONS_TAG = "PendingQuestions";

export const PENDING_QUESTIONS_DESCRIPTION =
  "This item contains all questions raised by the parent consumer, to help us keep track of these questions.\n" +
  "Any questions that are not Closed or Resolved are active and we need to find answers to them.\n" +
  "Person assigned to the item is responsible with finding the answer. The answer should be recorded in the description of the item before closing for later reference.";

/** Tagged User Stories directly under a consumer are its question stores, regardless of title. */
export function isPendingQuestionsStory(item: TrackedWorkItem): boolean {
  return (
    item.type.trim().toLowerCase() === "user story" &&
    hasWorkItemTag(item.tags, PENDING_QUESTIONS_TAG)
  );
}

/** Real feature requests, excluding every tagged story used only to hold questions. */
export function consumerRequests(consumer: TrackedWorkItem): TrackedWorkItem[] {
  return consumer.children.filter((item) => !isPendingQuestionsStory(item));
}

const TERMINAL_QUESTION_STATES = new Set(["closed", "resolved", "removed"]);

/** Active Task children aggregated from every Pending Questions story under the consumer. */
export function openConsumerQuestions(consumer: TrackedWorkItem): TrackedWorkItem[] {
  return consumer.children
    .filter(isPendingQuestionsStory)
    .flatMap((story) => story.children)
    .filter(
      (question) =>
        question.type.trim().toLowerCase() === "task" &&
        !TERMINAL_QUESTION_STATES.has(question.state.trim().toLowerCase()),
    );
}

/** Whether at least one tracked question still needs an answer. */
export function hasActivePendingQuestions(consumer: TrackedWorkItem): boolean {
  return openConsumerQuestions(consumer).length > 0;
}
