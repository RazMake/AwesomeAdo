# Navigation

Utilities for detecting Azure DevOps Query routes and forwarding navigation events from the
background service worker to content scripts.

## Why host-wide injection is required

Azure DevOps is a single-page application. A content script injected at `document_idle` is only
invoked once per hard navigation; subsequent in-page route changes do not re-inject the script.
To detect SPA navigation the extension:

1. Declares `"webNavigation"` permission and registers `onHistoryStateUpdated` and
   `onReferenceFragmentUpdated` listeners in the service worker.
2. Forwards each top-frame URL change to the active content script via
   `chrome.tabs.sendMessage` with a `documentId` so the message is routed to the exact document.
3. The content script listens for `AdoNavigationMessage` and calls
   `QueryPageController.navigate(url)` on every SPA transition.

Because `_queries` can appear anywhere in the ADO path (e.g. `/org/project/_queries/query/id`),
the content script must be injected on `https://dev.azure.com/*` and `https://*.visualstudio.com/*`
globally, and `isAdoQueryUrl` decides at runtime whether blanking applies.

## Exports

### `AdoHost.ts`

The single source of truth for "which URLs are hosted Azure DevOps". Every other module here — and
both tab readers — derives its host decision from this, so adding an origin is a one-line change.

- **`isSupportedAdoHost(url)`** — `true` when `url` is HTTPS on `dev.azure.com` or an
  `*.visualstudio.com` subdomain. The suffix check is anchored so lookalikes such as
  `fake.visualstudio.com.evil.com` are rejected — do not relax this.
- **`VISUAL_STUDIO_SUFFIX`** — the `.visualstudio.com` suffix constant.
- **`ADO_HOST_MATCH_PATTERNS`** — the match-pattern globs in the exact shape
  `chrome.tabs.query({ url })` and the manifest `content_scripts.matches` expect. The tab readers
  import this; a test keeps it in sync with the manifest.
- **`parseSupportedAdoUrl(rawUrl)`** — parses `rawUrl` and returns it only when it is a supported
  ADO host (null otherwise), so the route and identity parsers share one host-guard preamble.

### `AdoQueryRoute.ts`

- **`ADO_NAVIGATION_MESSAGE`** — the string literal type used as the message discriminator.
- **`AdoNavigationMessage`** — the typed message sent by the background service worker.
- **`isAdoNavigationMessage(value)`** — type guard for incoming `chrome.runtime.onMessage` payloads.
- **`isAdoQueryUrl(rawUrl)`** — returns `true` when the URL points to an ADO Query route on either
  supported host.
- **`parseAdoQueryId(rawUrl)`** — returns the GUID identifying the single saved query a hosted ADO
  URL points at (from `/_queries/query/{id}` or `/_queries/query-edit/{id}`), lowercased, or `null`
  when the URL is not a single-query route. Stricter than `isAdoQueryUrl` on purpose: query folders
  and list views (`_queries/all`, `_queries/favorites`) resolve to `null` because bindings key off a
  concrete query id.

### `NavigationNotifier.ts`

- **`notifyNavigation(details, sendMessage)`** — forwards a top-frame navigation to the content
  script. Subframe events are silently ignored. Sender rejections (no-receiver race) are swallowed.

### `AdoContext.ts`

Azure DevOps identity plus the message contract the options page uses to learn the live tab's
theme.

- **`AdoTheme`** — `"light" | "dark"`, the two themes the extension can distinguish.
- **`AdoContext`** — `{ organization, project }` parsed from an ADO URL (`project` is `null` on
  org-level Query URLs).
- **`AdoTabContext`** — `AdoContext` plus `theme` (the theme the live tab is rendering, or `null`
  when it could not be determined).
- **`parseAdoContext(rawUrl)`** — extracts `{ organization, project }` from either
  `https://dev.azure.com/{org}/{project}/...` or `https://{org}.visualstudio.com/{project}/...`,
  or `null` when the URL is not a recognized hosted ADO location (host discrimination is delegated
  to `AdoHost.isSupportedAdoHost`).
- **`ADO_THEME_REQUEST`**, **`AdoThemeRequest`**, **`AdoThemeResponse`**,
  **`isAdoThemeRequest(value)`** — the request/response message the options page sends to an ADO
  content script (via `chrome.tabs.sendMessage`) to read the rendered theme. The content script
  answers with `detectAdoTheme(document)`.
