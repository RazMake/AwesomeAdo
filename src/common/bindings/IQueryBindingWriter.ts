import type { QueryBinding } from "./QueryBinding";

/**
 * Creating and removing the binding for ONE query.
 *
 * Narrower than `IQueryBindingStore` on purpose (Interface Segregation): a view that creates a
 * query for a project needs to record the binding for it and to clean it up again, and nothing more
 * — handing it the whole store would also hand it `replaceAll`, which discards every other query's
 * binding in one call.
 */
export interface IQueryBindingWriter {
  /** Create or replace the binding for a single query. Other queries are left untouched. */
  bind(queryId: string, binding: QueryBinding): Promise<void>;

  /** Remove the binding for a single query. Other queries are left untouched; a no-op if absent. */
  unbind(queryId: string): Promise<void>;
}
