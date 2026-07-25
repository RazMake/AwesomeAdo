/**
 * The contract a view implements to paint its enhanced surface.
 *
 * A `ViewType` (see `ViewType.ts`) declares a view's *configuration*; an `EnhancedView` is its
 * *runtime behaviour* — the DOM it shows once a bound query resolves to that view. The two are kept
 * separate on purpose: the options binding form and settings import/export only need the config, so
 * they never pull a renderer (and its DOM code) into their bundle.
 */

/** Everything a view needs to render, injected so a view never reaches for a global (Dependency Inversion). */
export interface EnhancedViewContext {
  /** The document the view builds its DOM in. */
  doc: Document;
  /** The bound query's id, so a view can scope what it fetches and shows. */
  queryId: string;
  /**
   * The binding's resolved per-query property values, keyed by `ViewTypeProperty.key`. The same
   * view bound to two queries can therefore render differently.
   */
  properties: Record<string, string>;
}

/** A renderable enhanced view: the surface AwesomeADO paints in place of ADO's own query page. */
export interface EnhancedView {
  /** Matches the owning `ViewType.id`, so the registry resolves a binding's view to its renderer. */
  readonly id: string;
  /**
   * Build the DOM for this view. The caller (the content surface) mounts the returned node and owns
   * its lifecycle, so a view returns a fresh element each call and never caches document-scoped state.
   */
  render(context: EnhancedViewContext): HTMLElement;
}
