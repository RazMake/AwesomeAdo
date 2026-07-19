/**
 * Which presentation a bound query currently shows: its own enhanced view, or ADO's standard page.
 *
 * A query stays bound either way — this is a per-query toggle, separate from which enhanced view it
 * is bound to, so the user can drop back to ADO's own page for one query without losing its binding.
 */
export type ActiveView = "enhanced" | "standard";

/**
 * A binding records that a specific ADO query is handled by the extension, and how.
 *
 * Each query id maps to exactly one binding, and every binding carries its own copy of the view's
 * properties: the same view bound to two different queries can hold different settings. Keeping the
 * property values on the binding (not on the view) is what makes those per-query settings possible.
 */
export interface QueryBinding {
  /** The `ViewType.id` this query is bound to. */
  view: string;
  /** Values for the bound view's properties, specific to this query. Keyed by `ViewTypeProperty.key`. */
  properties: Record<string, string>;
  /**
   * The query's human-readable name, captured when the binding was saved. Optional because it is a
   * best-effort read of ADO's page; it lets the options management UI label a bound query even when
   * that query's ADO tab is closed, without re-scraping ADO.
   */
  name?: string;
  /**
   * Explicit per-query presentation override set from the top-bar menu. Absent means the query has
   * no override and follows the global default view — which is why the global default "only applies
   * to bound queries": an unbound query is never enhanced at all.
   */
  active?: ActiveView;
}

/** Every query binding, keyed by ADO query id. */
export type QueryBindings = Record<string, QueryBinding>;

/**
 * Resolve which presentation a bound query shows. An explicit per-query override wins; otherwise the
 * query follows the global default view. Kept as a pure helper so the content blanker and the
 * top-bar menu resolve the effective view identically.
 */
export function resolveActiveView(
  active: ActiveView | undefined,
  defaultEnhanced: boolean,
): ActiveView {
  return active ?? (defaultEnhanced ? "enhanced" : "standard");
}

/**
 * Convert an unknown value read from synced storage into a valid map of bindings.
 *
 * Storage can hold anything (first run = undefined; a newer build = views/props this build does not
 * recognize), so consumers must go through this normalizer instead of trusting the raw value.
 * Unknown view ids are preserved on purpose: a binding written by a newer version still marks its
 * query as handled here, so the prompt does not re-appear on an older install.
 */
export function normalizeBindings(raw: unknown): QueryBindings {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const result: QueryBindings = {};
  for (const [queryId, value] of Object.entries(raw)) {
    const binding = normalizeBinding(value);
    if (binding !== null) {
      result[queryId] = binding;
    }
  }
  return result;
}

function normalizeBinding(value: unknown): QueryBinding | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Partial<QueryBinding>;
  if (typeof candidate.view !== "string" || candidate.view.length === 0) {
    return null;
  }
  const binding: QueryBinding = {
    view: candidate.view,
    properties: normalizeProperties(candidate.properties),
  };
  if (typeof candidate.name === "string" && candidate.name.length > 0) {
    binding.name = candidate.name;
  }
  // Only the two known values are preserved; anything else (including a missing field, or a value a
  // newer build wrote) is dropped so the query cleanly falls back to the global default view.
  if (candidate.active === "standard" || candidate.active === "enhanced") {
    binding.active = candidate.active;
  }
  return binding;
}

function normalizeProperties(raw: unknown): Record<string, string> {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    // Drop non-string values rather than coercing them, so a corrupt entry can't masquerade as a
    // filled-in required property later.
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}
