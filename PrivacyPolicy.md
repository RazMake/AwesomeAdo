# AwesomeADO Privacy Policy

Effective date: July 30, 2026

AwesomeADO is a browser extension that enhances hosted Azure DevOps Query pages. This policy
explains the information the extension handles and where that information goes.

## Information AwesomeADO handles

AwesomeADO handles information only as needed to provide its work-tracking features:

- Azure DevOps page and query information, including supported Azure DevOps URLs, query identifiers,
  work item fields, descriptions, tags, sprint and area metadata, and discussion comments.
- Azure DevOps identity information visible to the signed-in user, including display names, account
  names or email addresses, user identifiers, and profile images for assignees, authors, and other
  project members.
- Extension configuration, including appearance preferences, query bindings, team and area settings,
  work item mappings, sprint windows, marker tags, and view-specific settings.
- Device-local diagnostic entries, including timestamps, extension component names, decisions,
  technical identifiers, and error details. Diagnostics are designed not to record setting values,
  query names, authentication credentials, or work item content.

The extension uses the browser's existing Azure DevOps session to make requests. It does not read,
store, or transmit the user's password, session cookie, or access token.

## How information is used

AwesomeADO uses this information solely to:

- recognize supported Azure DevOps Query pages;
- render and filter enhanced work-tracking views;
- display Azure DevOps work items, discussions, and project identities;
- perform changes the user requests, such as editing a field, discussion comment, ordering, or
  hierarchy;
- remember extension configuration across pages and browser sessions; and
- provide device-local diagnostics for troubleshooting.

AwesomeADO does not use information for advertising, profiling, credit decisions, or purposes
unrelated to its user-facing Azure DevOps features.

## Storage and retention

- Configuration and query bindings are stored with the browser's sync storage. The browser provider
  may synchronize this configuration to other browser instances signed in to the same browser
  account. It remains there until the user changes or removes it, clears extension data, or the
  browser provider removes it under its own retention rules.
- Diagnostic entries are stored only in the browser's local extension storage. The log is bounded to
  500 entries, automatically discards the oldest entries, and can be cleared from AwesomeADO's
  Diagnostics page.
- Azure DevOps work item and identity data is held in memory while needed to render the current view.
  AwesomeADO does not create a persistent local cache of that data.
- Configuration exported by the user is written to a local `AwesomeADO.config` file. The user
  controls that file and is responsible for its storage and deletion.

## Sharing and transmission

AwesomeADO sends Azure DevOps reads and user-requested changes only to the hosted Azure DevOps
organization the user is visiting, over HTTPS. The extension does not operate a developer backend and
does not send user data to the AwesomeADO developer, analytics services, advertising networks, or
data brokers.

Configuration placed in browser sync storage is handled by the user's browser provider according to
that provider's terms and privacy policy. AwesomeADO does not otherwise sell, rent, or transfer user
data to third parties.

## Remote code and analytics

AwesomeADO does not download or execute remotely hosted code. It does not include advertising,
tracking pixels, or third-party analytics.

## Chrome Web Store Limited Use

AwesomeADO's use and transfer of information received from Chrome APIs complies with the Chrome Web
Store User Data Policy, including its Limited Use requirements.

## Security

Network requests are limited to `https://dev.azure.com` and hosted
`https://*.visualstudio.com` organizations. AwesomeADO relies on the browser and Azure DevOps to
protect the user's authenticated session and uses only the permissions needed for its documented
features.

## Changes to this policy

This policy may be updated when AwesomeADO's data practices change. Material changes will be
published in this file with a new effective date.

## Contact

Questions or privacy requests can be submitted through the public support tracker:
https://github.com/RazMake/AwesomeAdo/issues
