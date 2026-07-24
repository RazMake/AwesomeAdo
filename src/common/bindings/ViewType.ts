/**
 * The catalog of views a query can be bound to.
 *
 * A "view" is a way AwesomeADO can present a query. Each view declares the properties it needs to
 * be usable; a binding to that view is only valid once every required property is supplied. Views
 * carry no rendering yet — this catalog is the single, ordered source of truth that both the
 * top-bar prompt and the options binding form read, so adding a new view is a one-line change here.
 */

import { DEFAULT_ORDERING_POLICY, ORDERING_POLICIES } from "../ordering/ItemOrdering";

/** How a view property is entered on the binding form and validated before it is stored. */
export type ViewTypePropertyKind = "text" | "number" | "select";

/** One choice offered by a `select` property: the stored `value` and the label shown for it. */
export interface ViewTypeOption {
  value: string;
  label: string;
}

/** A single configurable input a view exposes on the binding form. */
export interface ViewTypeProperty {
  /** Stable key stored on the binding; never shown to the user. */
  key: string;
  /** Human-readable label shown next to the input. */
  label: string;
  /** When true, a binding cannot be saved until this property has a value. */
  required: boolean;
  /** How the value is entered and validated. Absent means a plain text input. */
  kind?: ViewTypePropertyKind;
  /** The choices offered by a `select` property, in the order they appear; ignored otherwise. */
  options?: readonly ViewTypeOption[];
  /**
   * Value applied when a binding stores none: seeded into a fresh input and substituted at save
   * time, so an unconfigured field still behaves. Absent leaves the field empty until the user
   * types one.
   */
  defaultValue?: string;
  /** Inclusive bounds a `number` value is forced into; omit an end to leave it open. */
  min?: number;
  max?: number;
  /** One-line "why" shown under the input to guide the value. */
  hint?: string;
}

/** A view a query can be bound to. */
export interface ViewType {
  /** Stable id persisted on the binding; never renamed once shipped. */
  id: string;
  /** Human-readable name shown in the view picker. */
  label: string;
  /** Properties the view needs; empty means the view can be bound as-is. */
  properties: readonly ViewTypeProperty[];
}

/**
 * Every view offered to the user, in the order they appear in the picker. Add new views by
 * appending an entry; nothing else in the binding flow needs to change.
 */
export const VIEW_TYPES: readonly ViewType[] = [
  { id: "sprint", label: "Sprint View", properties: [] },
  {
    id: "projectTracking",
    label: "Project Tracking",
    properties: [
      {
        key: "orderingPolicy",
        label: "Items ordering policy",
        required: false,
        kind: "select",
        options: ORDERING_POLICIES.map((policy) => ({ value: policy.value, label: policy.label })),
        // Encapsulated in src/common/ordering so every renderer sorts items the same way; the raw
        // sort key (e.g. StackRank vs. the ETA field) is resolved by that component, not stored here.
        defaultValue: DEFAULT_ORDERING_POLICY,
        hint: "How items are ordered within each group.",
      },
      {
        key: "weeks",
        label: "Updates window (weeks)",
        required: false,
        kind: "number",
        defaultValue: "2",
        min: 1,
        max: 52,
        hint: "How far back per-item Updates reach, in weeks. Only newer updates are shown; same-day entries are collapsed together.",
      },
      {
        key: "days",
        label: "Hide resolved after (days)",
        required: false,
        kind: "number",
        defaultValue: "4",
        min: 0,
        max: 3650,
        hint: "Resolved items are hidden once resolved more than this many days ago, unless an unresolved item still sits beneath them. 0 hides them immediately.",
      },
      {
        key: "hours",
        label: "Recent changes window (hours)",
        required: false,
        kind: "number",
        defaultValue: "24",
        min: 1,
        hint: "Rolling window behind the Newly Created, Newly Updated, and New Notes pills. Respected exactly, not rounded to whole days.",
      },
    ],
  },
];

/** Look up a view by its stored id, or undefined when the id is unknown (e.g. a newer build). */
export function getViewType(id: string): ViewType | undefined {
  return VIEW_TYPES.find((view) => view.id === id);
}

/** The property's kind, treating an unspecified kind as a plain text input. */
export function viewTypePropertyKind(property: ViewTypeProperty): ViewTypePropertyKind {
  return property.kind ?? "text";
}

/**
 * The value a binding should hold for a property given whatever it stored (possibly nothing).
 *
 * An empty stored value falls back to the property's declared default; a `number` value is coerced
 * to a whole number and forced into the property's [min, max] range. Both the binding form (seeding
 * an input and saving) and any future consumer route through this so defaulting and clamping never
 * drift apart.
 */
export function resolveViewTypePropertyValue(
  property: ViewTypeProperty,
  stored: string | undefined,
): string {
  const seed = (stored ?? "").trim() || (property.defaultValue ?? "");
  const kind = viewTypePropertyKind(property);
  if (kind === "select") {
    // A stored value only survives if it is still one of the offered choices, so a binding written
    // by a newer build (or a dropped option) falls back to the default rather than an orphan value.
    const isOffered = property.options?.some((option) => option.value === seed) ?? false;
    return isOffered ? seed : (property.defaultValue ?? "");
  }
  if (kind !== "number" || seed === "") {
    return seed;
  }
  return String(
    clampToRange(toWholeNumber(seed, property.defaultValue), property.min, property.max),
  );
}

/** Parse a whole number, falling back to the property's default (then 0) when the text is not one. */
function toWholeNumber(value: string, fallback: string | undefined): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  const fromDefault = Number.parseInt(fallback ?? "", 10);
  return Number.isFinite(fromDefault) ? fromDefault : 0;
}

function clampToRange(value: number, min: number | undefined, max: number | undefined): number {
  let result = value;
  if (min !== undefined) {
    result = Math.max(min, result);
  }
  if (max !== undefined) {
    result = Math.min(max, result);
  }
  return result;
}
