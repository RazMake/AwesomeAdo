import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import { hasWorkItemTag } from "../../../common/ado/workItemTags";

import { isOpenQuestion, questionStateMapping, type QuestionStateMapping } from "./questionStates";

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

/** Every question-storage story directly under a consumer, including legacy renamed stories. */
export function pendingQuestionsStories(consumer: TrackedWorkItem): TrackedWorkItem[] {
  return consumer.children.filter(isPendingQuestionsStory);
}

/** Real feature requests, excluding every tagged story used only to hold questions. */
export function consumerRequests(consumer: TrackedWorkItem): TrackedWorkItem[] {
  return consumer.children.filter((item) => !isPendingQuestionsStory(item));
}

/** The story new questions go under: the newest (highest id) when a consumer has several. */
export function latestPendingQuestionsStory(consumer: TrackedWorkItem): TrackedWorkItem | null {
  return pendingQuestionsStories(consumer).reduce<TrackedWorkItem | null>(
    (latest, story) => (latest === null || story.id > latest.id ? story : latest),
    null,
  );
}

const UNMAPPED_QUESTION_STATES = questionStateMapping({});

/** Active Task children aggregated from every Pending Questions story under the consumer. */
export function openConsumerQuestions(
  consumer: TrackedWorkItem,
  mapping: QuestionStateMapping = UNMAPPED_QUESTION_STATES,
): TrackedWorkItem[] {
  return pendingQuestionsStories(consumer)
    .flatMap((story) => story.children)
    .filter(
      (question) =>
        question.type.trim().toLowerCase() === "task" && isOpenQuestion(question, mapping),
    );
}

/** Whether at least one tracked question still needs an answer. */
export function hasActivePendingQuestions(
  consumer: TrackedWorkItem,
  mapping: QuestionStateMapping = UNMAPPED_QUESTION_STATES,
): boolean {
  return openConsumerQuestions(consumer, mapping).length > 0;
}
