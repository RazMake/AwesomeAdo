import { renderCheckboxFilter } from "../../../common/view-common/control/CheckboxFilter/CheckboxFilter";

export type ConsumerCondition =
  "all" | "waitingForAnswers" | "untriagedRequests" | "committedRequests";

export interface ConsumerConditionFilterOptions {
  condition: ConsumerCondition;
  onChange(condition: ConsumerCondition): void;
}

/** Every condition a link may name besides "all", which is the absence of the parameter. */
export const CONSUMER_CONDITIONS: readonly Exclude<ConsumerCondition, "all">[] = [
  "waitingForAnswers",
  "untriagedRequests",
  "committedRequests",
];

const OPTIONS: readonly {
  value: Exclude<ConsumerCondition, "all">;
  label: string;
  title: string;
}[] = [
  {
    value: "waitingForAnswers",
    label: "Waiting for answers",
    title: "Consumers waiting for answers",
  },
  {
    value: "untriagedRequests",
    label: "With untriaged requests",
    title: "Consumers with untriaged requests",
  },
  {
    value: "committedRequests",
    label: "With committed requests",
    title: "Consumers with committed requests",
  },
];

/**
 * A pick-one consumer condition on the shared right-side filter affordance. Pressing the trigger
 * while a condition is in force clears it, so the lit button is also its own reset.
 */
export function renderConsumerConditionFilter(
  doc: Document,
  options: ConsumerConditionFilterOptions,
): HTMLElement {
  return renderCheckboxFilter(doc, {
    label: "By state",
    fixedTitle: "Filter consumers by the state of their requests",
    classPrefix: "awesomeado-consumer-condition-filter",
    options: OPTIONS,
    singleSelect: true,
    clearOnTriggerWhenActive: true,
    selected: options.condition === "all" ? [] : [options.condition],
    onChange: ({ included }) => {
      const picked = OPTIONS.find(({ value }) => value === included[0]);
      options.onChange(picked?.value ?? "all");
    },
  }).element;
}
