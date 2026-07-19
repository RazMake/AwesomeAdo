/**
 * The single source of truth for "which URLs are hosted Azure DevOps". Every other module — the
 * query-route parser, the identity parser, and the tab readers — derives its host decision from
 * here so adding an origin (or on-prem support) is a one-line change instead of an edit spread
 * across four files that can silently diverge on the security-relevant suffix check.
 */

/** The DNS suffix ADO uses for per-organization hosts, e.g. `{org}.visualstudio.com`. */
export const VISUAL_STUDIO_SUFFIX = ".visualstudio.com";

/**
 * Match patterns for the hosted ADO origins, in the exact shape `chrome.tabs.query({ url })` and the
 * manifest's `content_scripts.matches` expect. The tab readers import this so they scan precisely
 * the origins the content script is injected on; keeping them in sync is enforced by a test.
 */
export const ADO_HOST_MATCH_PATTERNS: readonly string[] = [
  "https://dev.azure.com/*",
  "https://*.visualstudio.com/*",
];

/**
 * True when `url` is a hosted ADO location: HTTPS on `dev.azure.com` or an `*.visualstudio.com`
 * subdomain. The suffix check is anchored (`.visualstudio.com`) so lookalikes such as
 * `fake.visualstudio.com.evil.com` are rejected — do not relax this without the same anchoring.
 */
export function isSupportedAdoHost(url: URL): boolean {
  const supportedHost =
    url.hostname === "dev.azure.com" || url.hostname.endsWith(VISUAL_STUDIO_SUFFIX);
  return url.protocol === "https:" && supportedHost;
}

/**
 * Parse `rawUrl` and return it only when it points at a supported ADO host, or null when it is
 * malformed or off-host. Centralizes the "valid URL + supported host" preamble that the route and
 * identity parsers would otherwise duplicate before inspecting the path.
 */
export function parseSupportedAdoUrl(rawUrl: string): URL | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  return isSupportedAdoHost(url) ? url : null;
}
