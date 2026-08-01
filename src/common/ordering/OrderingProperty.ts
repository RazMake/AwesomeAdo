import { resolveViewTypePropertyValue, type ViewTypeProperty } from "../view-common/ViewType";

import { DEFAULT_ORDERING_POLICY, ORDERING_POLICIES, type OrderingPolicy } from "./ItemOrdering";

/** Shared binding property used by every view that exposes the common ordering policies. */
export const orderingPolicyProperty: ViewTypeProperty = {
  key: "orderingPolicy",
  label: "Items ordering policy",
  required: false,
  kind: "select",
  options: ORDERING_POLICIES.map(({ value, label }) => ({ value, label })),
  defaultValue: DEFAULT_ORDERING_POLICY,
  hint: "How items are ordered within each group.",
};

/** Resolve a stored ordering policy, falling back when another build wrote an unknown id. */
export function orderingPolicyOf(properties: Record<string, string>): OrderingPolicy {
  const stored = resolveViewTypePropertyValue(
    orderingPolicyProperty,
    properties[orderingPolicyProperty.key],
  );
  return (
    ORDERING_POLICIES.find((policy) => policy.value === stored)?.value ?? DEFAULT_ORDERING_POLICY
  );
}
