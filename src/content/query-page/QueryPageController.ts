import type { QueryBindings } from "../../common/bindings/QueryBinding";
import { resolveActiveView } from "../../common/bindings/QueryBinding";
import type { ILogger } from "../../common/logging/ILogger";
import { isAdoQueryUrl, parseAdoQueryId } from "../../common/navigation/AdoQueryRoute";
import { isAdoConfigured, type ExtensionSettings } from "../../common/settings/ExtensionSettings";

import { PageBlanker } from "./PageBlanker";

/** Combines the current setting and URL so enhancement never leaks outside an ADO Query route. */
export class QueryPageController {
  private settings: ExtensionSettings | undefined;
  private bindings: QueryBindings | undefined;
  // The last value handed to the blanker, so the enhance/plain decision is logged only when it
  // actually flips — refresh() runs on every settings, bindings, and navigation event, and logging
  // each pass would flood the bounded diagnostics ring buffer.
  private lastEnhance: boolean | undefined;

  constructor(
    private readonly blanker: PageBlanker,
    private url: string,
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

  private refresh(): void {
    if (!this.settings) {
      return;
    }
    const decision = this.decide(this.settings);
    this.blanker.apply(decision.enhance);
    if (decision.enhance !== this.lastEnhance) {
      // Log the conclusion together with every signal that drove it, so a "why isn't my query
      // enhanced?" report can be answered from the log alone without reproducing the page state.
      this.logger.info(
        `Query page ${decision.enhance ? "enhanced" : "left on ADO's view"}: reason=${decision.reason}, ` +
          `queryRoute=${isAdoQueryUrl(this.url)}, configured=${isAdoConfigured(this.settings)}, ` +
          `queryId=${parseAdoQueryId(this.url) ?? "none"}, defaultView=${this.settings.defaultView}`,
      );
      this.lastEnhance = decision.enhance;
    }
  }

  /** Decide whether to take over this page, returning a short machine-readable reason alongside the
   *  boolean so the log records not just *what* was decided but *why*. */
  private decide(settings: ExtensionSettings): { enhance: boolean; reason: string } {
    // Only take over ("enhanced") on an actual Query route; every other ADO page stays untouched.
    if (!isAdoQueryUrl(this.url)) {
      return { enhance: false, reason: "not-a-query-route" };
    }
    // Until the ADO settings are complete the enhanced view has nothing valid to render, so bound
    // queries fall back to ADO's own page regardless of their per-query or default-view preference.
    if (!isAdoConfigured(settings)) {
      return { enhance: false, reason: "ado-not-configured" };
    }
    const queryId = parseAdoQueryId(this.url);
    const binding = queryId !== null ? this.bindings?.[queryId] : undefined;
    // An unbound query — and any query route with no single query id — is never enhanced: without a
    // binding there is no view to show, so the page is left as ADO's own. The global default only
    // decides how a *bound* query with no explicit per-query override is presented.
    if (binding === undefined) {
      return { enhance: false, reason: "query-not-bound" };
    }
    const active = resolveActiveView(binding.active, settings.defaultView === "enhanced");
    return {
      enhance: active === "enhanced",
      reason: active === "enhanced" ? "bound-view-active" : "bound-standard-active",
    };
  }
}
