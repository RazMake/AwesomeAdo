import type { QueryBindings } from "../common/bindings/QueryBinding";
import { resolveActiveView } from "../common/bindings/QueryBinding";
import { isAdoQueryUrl, parseAdoQueryId } from "../common/navigation/AdoQueryRoute";
import type { ExtensionSettings } from "../common/settings/ExtensionSettings";

import { PageBlanker } from "./PageBlanker";

/** Combines the current setting and URL so enhancement never leaks outside an ADO Query route. */
export class QueryPageController {
  private settings: ExtensionSettings | undefined;
  private bindings: QueryBindings | undefined;

  constructor(
    private readonly blanker: PageBlanker,
    private url: string,
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
    this.blanker.apply(this.shouldEnhance());
  }

  private shouldEnhance(): boolean {
    // Only take over ("enhanced") on an actual Query route; every other ADO page stays untouched.
    if (this.settings === undefined || !isAdoQueryUrl(this.url)) {
      return false;
    }
    const queryId = parseAdoQueryId(this.url);
    const binding = queryId !== null ? this.bindings?.[queryId] : undefined;
    // An unbound query — and any query route with no single query id — is never enhanced: without a
    // binding there is no view to show, so the page is left as ADO's own. The global default only
    // decides how a *bound* query with no explicit per-query override is presented.
    if (binding === undefined) {
      return false;
    }
    return (
      resolveActiveView(binding.active, this.settings.defaultView === "enhanced") === "enhanced"
    );
  }
}
