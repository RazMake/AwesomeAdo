# src/content/session-banner

The page-level banner that tells the reader their Azure DevOps sign-in has expired.

## Public API

### `SessionExpiredBanner.ts`

- **`new SessionExpiredBanner(doc, openSignIn, logger)`** — construct once at the content
  composition root with a `content/session-banner` logger. `openSignIn` opens the organization's
  sign-in flow (in a new tab, so the current page keeps its state).
- **`show()`** / **`hide()`** — idempotent; driven by the background worker's
  `AdoSessionMessage` (`common/ado-session`). The reader can also dismiss it with its **×** button.
- **`applyTheme(theme)`** — follow the selected AwesomeADO theme.
- **`isShown`** — whether the banner is currently on the page.

## Usage

The background worker renews an expired sign-in silently before running a request. It sends
`signedIn: false` only when silent renewal failed and the reader has to sign in themselves, and
`signedIn: true` once a later request finds the session valid again.
