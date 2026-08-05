import type { QueryBindings } from "../../common/bindings/QueryBinding";
import {
  normalizeSettings,
  withoutPersonalSettings,
  type ExtensionSettings,
} from "../../common/settings/ExtensionSettings";

import type { SharedQueryConfiguration } from "./SharedQueryController";

/**
 * The settings the current page renders with: the publisher's when the query is shared read-only,
 * the reader's own otherwise.
 *
 * The publisher's values are layered OVER the reader's rather than replacing them wholesale, because
 * a payload only carries the settings it described usably; anything it left out still needs an
 * answer, and the reader's own is the only one available. Personal settings are never taken from the
 * publisher: opening someone else's query must not repaint the reader's own page.
 */
export function overlaySettings(
  local: ExtensionSettings,
  shared: SharedQueryConfiguration | null,
): ExtensionSettings {
  return shared === null
    ? local
    : normalizeSettings({ ...local, ...withoutPersonalSettings(shared.settings) });
}

/**
 * The bindings the current page resolves against, with the shared query's own binding substituted.
 *
 * Only the shared query's entry is touched: the reader's other bindings stay exactly as they are, so
 * opening someone else's query never changes what their own queries do. A shared query the publisher
 * does not enhance is removed rather than left on the reader's stale entry, because the publisher's
 * configuration is the whole truth for that query.
 */
export function overlayBindings(
  local: QueryBindings,
  shared: SharedQueryConfiguration | null,
): QueryBindings {
  if (shared === null) {
    return local;
  }
  const merged = { ...local };
  if (shared.binding === null) {
    delete merged[shared.queryId];
  } else {
    merged[shared.queryId] = shared.binding;
  }
  return merged;
}
