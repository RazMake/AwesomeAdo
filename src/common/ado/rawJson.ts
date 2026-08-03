/**
 * The two narrowings every ADO response parser in this folder starts from.
 *
 * Kept in one place because ADO's bodies are `unknown` at every entry point: each parser would
 * otherwise carry its own copy, and a subtle difference between two of them (treating `""` as a
 * value, or an array as a record) would show up as one parser quietly accepting what its neighbour
 * rejects.
 */

/** The value as a plain object to read fields off, or null when it is not one. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** The value as text, or null when it is absent or empty — an empty handle is never an answer. */
export function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
