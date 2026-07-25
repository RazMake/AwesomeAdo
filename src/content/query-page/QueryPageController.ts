import type { QueryBindings } from "../../common/bindings/QueryBinding";
import { resolveActiveView } from "../../common/bindings/QueryBinding";
import type { ILogger } from "../../common/logging/ILogger";
import { isAdoQueryUrl, parseAdoQueryId } from "../../common/navigation/AdoQueryRoute";
import { isAdoConfigured, type ExtensionSettings } from "../../common/settings/ExtensionSettings";
import type { IActiveViewOverrides } from "../active-view/IActiveViewOverrides";

import type { EnhancedViewRequest, EnhancedViewSurface } from "./EnhancedViewSurface";

/** Combines the current setting and URL so enhancement never leaks outside an ADO Query route. */
export class QueryPageController {
  private settings: ExtensionSettings | undefined;
  private bindings: QueryBindings | undefined;
  // The last conclusion handed to the surface, so the enhance/plain decision is logged only when it
  // actually changes — refresh() runs on every settings, bindings, and navigation event, and logging
  // each pass would flood the bounded diagnostics ring buffer.
  private lastConclusion: string | undefined;

  constructor(
    private readonly surface: EnhancedViewSurface,
    private url: string,
    private readonly overrides: IActiveViewOverrides,
    private readonly logger: ILogger,
  ) {}

  applySettings(settings: ExtensionSettings): void {
    this.settings = settings;
    this.refresh();
  }

  applyBindings(bindings: QueryBindings): void {
    this.bindings = bindings;
    this.refresh();
  }

  navigate(url: string): void {
    this.url = url;
    this.refresh();
  }

  /**
   * Re-evaluate after the user switches this session's view for the current query. The override is
   * read live from the injected store, so this just nudges a fresh decision rather than carrying the
   * new value — keeping one source of truth for the active view.
   */
  applyActiveViewOverride(): void {
    this.refresh();
  }

  private refresh(): void {
    if (!this.settings) {
      return;
    }
    const decision = this.decide(this.settings);
    this.surface.apply(decision.request);
    const conclusion = decision.request ? `enhanced:${decision.request.viewId}` : "left-on-ado";
    if (conclusion !== this.lastConclusion) {
      // Log the conclusion together with every signal that drove it, so a "why isn't my query
      // enhanced?" report can be answered from the log alone without reproducing the page state.
      this.logger.info(
        `Query page ${
          decision.request ? `enhanced with view ${decision.request.viewId}` : "left on ADO's view"
        }: reason=${decision.reason}, queryRoute=${isAdoQueryUrl(this.url)}, ` +
          `configured=${isAdoConfigured(this.settings)}, queryId=${parseAdoQueryId(this.url) ?? "none"}, ` +
          `defaultView=${this.settings.defaultView}, ` +
          `sessionOverride=${this.overrides.get(parseAdoQueryId(this.url) ?? "") ?? "none"}`,
      );
      this.lastConclusion = conclusion;
    }
  }

  /** Decide which view (if any) takes over this page, returning a short machine-readable reason
   *  alongside the request so the log records not just *what* was decided but *why*. */
  private decide(settings: ExtensionSettings): {
    request: EnhancedViewRequest | null;
    reason: string;
  } {
    // Only take over on an actual Query route; every other ADO page stays untouched.
    if (!isAdoQueryUrl(this.url)) {
      return { request: null, reason: "not-a-query-route" };
    }
    // Until the ADO settings are complete the enhanced view has nothing valid to render, so bound
    // queries fall back to ADO's own page regardless of the default view or this session's override.
    if (!isAdoConfigured(settings)) {
      return { request: null, reason: "ado-not-configured" };
    }
    const queryId = parseAdoQueryId(this.url);
    const binding = queryId !== null ? this.bindings?.[queryId] : undefined;
    // An unbound query — and any query route with no single query id — is never enhanced: without a
    // binding there is no view to show, so the page is left as ADO's own. The global default only
    // decides how a *bound* query with no in-session override is presented.
    if (binding === undefined || queryId === null) {
      return { request: null, reason: "query-not-bound" };
    }
    // The presentation is driven by the global default, flipped only by this session's override —
    // never by a persisted per-query field, so a reopened browser always starts from the default.
    const active = resolveActiveView(
      this.overrides.get(queryId),
      settings.defaultView === "enhanced",
    );
    if (active !== "enhanced") {
      return { request: null, reason: "bound-standard-active" };
    }
    return {
      request: { viewId: binding.view, queryId, properties: binding.properties },
      reason: "bound-view-active",
    };
  }
}
