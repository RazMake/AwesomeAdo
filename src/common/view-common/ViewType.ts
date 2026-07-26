/**
 * The contract every enhanced view declares its configuration with.
 *
 * A "view" is a way AwesomeADO can present a query. Each view owns its own folder under
 * `src/content/views/<view>/` and exports a `ViewType` describing the properties it needs to be
 * usable; a binding to that view is only valid once every required property is supplied. This file
 * holds only the shape and the value helpers — the ordered catalog of the views themselves lives in
 * `src/content/views/viewCatalog.ts`, which references each view's own config module.
 */

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
    return resolveSelectValue(property, seed);
  }
  if (kind !== "number" || seed === "") {
    return seed;
  }
  return String(
    clampToRange(toWholeNumber(seed, property.defaultValue), property.min, property.max),
  );
}

/**
 * The value a `select` property keeps: the seed only survives when it is still one of the offered
 * choices, so a binding written by a newer build (or one whose option was dropped) falls back to the
 * declared default rather than persisting an orphan value the picker can no longer show.
 */
function resolveSelectValue(property: ViewTypeProperty, seed: string): string {
  const isOffered = property.options?.some((option) => option.value === seed) ?? false;
  return isOffered ? seed : (property.defaultValue ?? "");
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
