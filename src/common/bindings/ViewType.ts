/**
 * The catalog of views a query can be bound to.
 *
 * A "view" is a way AwesomeADO can present a query. Each view declares the properties it needs to
 * be usable; a binding to that view is only valid once every required property is supplied. Views
 * carry no rendering yet — this catalog is the single, ordered source of truth that both the
 * top-bar prompt and the options binding form read, so adding a new view is a one-line change here.
 */

/** A single configurable input a view exposes on the binding form. */
export interface ViewTypeProperty {
  /** Stable key stored on the binding; never shown to the user. */
  key: string;
  /** Human-readable label shown next to the input. */
  label: string;
  /** When true, a binding cannot be saved until this property has a value. */
  required: boolean;
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
  { id: "projectTracking", label: "Project Tracking", properties: [] },
];

/** Look up a view by its stored id, or undefined when the id is unknown (e.g. a newer build). */
export function getViewType(id: string): ViewType | undefined {
  return VIEW_TYPES.find((view) => view.id === id);
}
