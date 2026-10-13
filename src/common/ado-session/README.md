# src/common/ado-session

Keeps the Azure DevOps sign-in that every extension request rides on usable while a tab stays open
for a long time.

The extension holds no token of its own: each read and write runs in the ADO page with the page's
session cookie. Azure DevOps lets that session expire, and a background `fetch` cannot renew it. This
component checks the session before the worker runs a request and, when it has expired, renews it
through a background tab before the request runs.

## Public API

### `AdoSessionGuard.ts`

- **`new AdoSessionGuard(dependencies)`** — construct once at the background composition root. The
  dependencies (`AdoSessionGuardDependencies`) supply the tab's organization, the page-world probe,
  an inactive renewal tab, the tab notification, a clock, a delay, and a `common/ado-session`
  logger.
- **`ensureSignedIn(tabId)`** — await before running a page-world request in `tabId`. It resolves
  once the sign-in is confirmed (trusted for `SESSION_CONFIRMATION_TTL_MS`), renewed, or known to
  need the reader; it never rejects and never blocks the request on its own failure.
- Tuning constants: `SESSION_CONFIRMATION_TTL_MS`, `RENEWAL_POLL_INTERVAL_MS`,
  `RENEWAL_TIMEOUT_MS`, `RENEWAL_RETRY_COOLDOWN_MS`.

### `AdoSessionProbe.ts`

- **`buildAdoSessionProbeUrl(organizationBase)`** — the `ConnectionData` URL a check reads.
- **`classifyAdoSessionProbe(outcome)`** — `"signed-in"`, `"expired"`, or `"unknown"` for one
  `AdoSessionProbeOutcome`. Only proof of a lost session is `"expired"`; network faults and server
  errors are `"unknown"` and never trigger a renewal.

### `AdoSessionMessage.ts`

- **`ADO_SESSION_MESSAGE`**, **`AdoSessionMessage`** (`{ type, signedIn }`),
  **`isAdoSessionMessage(message)`** — the background → content notification that shows or hides
  the page's sign-in banner (`content/session-banner`).

## Usage

The page-world side of the probe is `common/browser/probeAdoSessionInPage`. Every MAIN-world
injection in the background worker goes through one wrapper that awaits `ensureSignedIn` first, so a
new request type is covered without extra work.
