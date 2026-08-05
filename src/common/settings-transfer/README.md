# `common/settings-transfer`

Serializes the user's **entire** configuration to and from a single `AwesomeADO.config` file, so a
user can back it up or move it between machines. The file carries every extension setting (theme,
default view, organization, project, current team, sprint counts, dated per-sprint area selections,
board columns, work item
types) **and** every enhanced-query binding (which queries are enhanced and each one's per-view
property values, including Sprint View's default Lane area paths).

This component is pure data plumbing: no DOM, no `chrome.*`. The options-side controller that wires
it to buttons and the two stores lives in `src/options/settings-transfer`.

## Public API

### `AwesomeAdoConfig.ts`

- `CONFIG_FILE_NAME` — `"AwesomeADO.config"`, the proposed download name.
- `CONNECTION_FILE_NAME` — `"AwesomeADO.connection.config"`, the proposed name for the
  connection-only export.
- `CONFIG_FORMAT_VERSION` — the format version stamped into every export. Version 2 makes Primary
  Work classification authoritative; version 1 imports preserve the current classifications when
  the older payload contains no such field.
- `CONNECTION_CONFIG_SCOPE` — the `configScope` value that marks a connection-only file. A file with
  no scope is a full configuration, so every export written before this field existed still reads as
  one.
- `AwesomeAdoConfig` — the on-disk file shape: `{ awesomeAdoConfigVersion, settings, enhancedQueries }`.
- `AwesomeAdoConnectionConfig` — the connection-only file shape:
  `{ awesomeAdoConfigVersion, configScope, settings: { organization, project }, teamConfigWorkItemId }`.
- `ConfigImportError` — an `Error` carrying `problems: readonly string[]`, every fault in one throw.
- `ImportedConfig` — what an import yields:
  `{ settings, hasPrimaryWorkClassification, enhancedQueries, replacesBindings, problems }`, where
  `settings` is a **`Partial<ExtensionSettings>`** holding only the settings the file supplied
  usably, the Primary Work signal controls legacy migration, `replacesBindings` says whether
  `enhancedQueries` is authoritative, and `problems` lists everything the file got wrong.
- `exportConfig(settings, enhancedQueries, teamConfigWorkItemId?)` — serialize to the exact indented
  JSON text written to the file. Values pass through the same normalizers used on storage reads, so
  an export is always a clean snapshot. The optional trusted source ID is included in file exports.
- `exportCompactConfig(settings, enhancedQueries)` — serialize the same normalized shape without
  indentation or presentation whitespace for the team configuration work item Description.
- `exportConnectionConfig(settings, teamConfigWorkItemId)` — serialize only the connection: the
  trusted work item id plus the organization and project needed to reach it. It deliberately carries
  no bindings and no presentation settings, so a teammate adopts the team's **live** source instead
  of a snapshot that starts drifting the moment the team publishes again.
- `importConfig(text)` — parse a selected file's text and salvage as much of it as possible. Every
  setting and binding the file describes usably is returned (normalized, so nothing malformed can be
  persisted); each one it got wrong is left out and described in `problems` instead — a single bad
  value costs the user that one value, not the whole import, and a setting the file omits or gets
  wrong keeps whatever the user has configured today. Throws `ConfigImportError` only when the file
  yields nothing at all (not JSON, not an object, or missing a whole section), so importing an
  unrelated file cannot wipe settings to defaults.
  A connection-only file (`configScope: "connection"`) needs no `enhancedQueries` section and comes
  back with `replacesBindings: false`, so adopting a connection never deletes the enhanced queries it
  never described. It reports a problem when it names no work item id, because that is the only thing
  it exists to carry.
  The retired `areaPaths` key in a legacy file or shared payload is ignored without being persisted.
- `mergeImportedSettings(current, imported)` — apply legacy migrations that need current local
  context, including preserving Primary Work when a version 1 payload predates that field.

A non-empty `problems` list is a **failure to report**, not a footnote: the caller logs it and says
so, because a partly applied file must never read like a clean load.

Import writes are applied to the two stores by the caller: settings via `ISettingsStore.write`, and
bindings via `IQueryBindingStore.replaceAll` (a wholesale replace, not a merge).

## Team configuration

Team sharing stores the same full configuration as compact JSON in the `System.Description` field
of one Azure DevOps work item. The work item id is a separate trusted connection value under the synced
`teamConfig.workItemId` key; downloaded content cannot redirect clients to another source.
File export/import carries that trusted ID for backup and restore, but `exportCompactConfig` omits it
and `TeamConfigSynchronizer` never applies a source ID found in a remote payload.

- `TeamConfigSourceStore` / `BrowserSyncTeamConfigSourceStore` — read, save, or clear that trusted
  work item id.
- `ObservableTeamConfigSource` — the separate `observe(listener)` contract for following that id
  live. Kept apart from `TeamConfigSourceStore` so the pull/publish collaborators that read it once
  per operation are not forced to implement a subscription they never use.
- `createTeamConfigSourceStore(logger?)` — composition factory backed by `ChromeSyncStorage`,
  returning both contracts.
- `TeamConfigReader` / `TeamConfigWriter` — focused transport contracts for Description reads and
  revision-guarded publishes. A successful publish can carry the canonical work item web URL for the
  options status link.
- `TeamConfigSynchronizer` — pulls through `importConfig`, refuses partial/invalid remote files,
  reports an empty Description as connected but not yet published without changing local settings,
  replaces settings and bindings only when the normalized snapshot changed, and publishes the current
  full `exportCompactConfig` snapshot. It takes a `LocalSettingsAccess`, not an `ISettingsStore`, so a
  pull cannot publish what it just read. `publishBindings(writer, proposed)` publishes a caller's
  proposed binding map without rereading stale local bindings; `publishSettings(writer, proposed)`
  does the same for settings. Both let options publish before making a mutation observable to
  pull-triggered content views. Work-item type settings include their Primary Work classification in
  both directions. Concurrent pulls share one in-flight operation.
- `TeamSprintAreaPathStore` — pulls before Sprint reads, serializes per-sprint setting writes, and
  publishes the resulting full normalized configuration through the connected work item.
- `TeamSharedQueryBindingWriter` — an `IQueryBindingWriter` for content-script surfaces that create
  or delete a query of their own (a project's tracking query). It publishes the proposed full map
  first and mutates the local store only once the work item accepted it, so a removed binding is not
  restored — and a new one is not erased — by the next pull. A failed publish leaves local state
  unchanged and is logged; with no team connected it simply writes locally.
- `TeamSharedSettingsStore` — the `ITeamPublishingSettingsStore` used by every options control that
  edits settings. It serializes edits, publishes each proposed full settings snapshot first, and
  writes the accepted partial update locally second. A failed publish rejects the edit without
  changing local storage; with no team connected it delegates to the local store.
- `ITeamPublishingSettingsStore` — `ISettingsStore` plus a `publishesBeforeWrite: true` marker. The
  marker is what makes the distinction visible to the compiler: the stores are otherwise structurally
  identical, so a control that must publish would silently accept one that does not. See ADR-074.
- `IPersonalSettingsStore` / `personalSettingsStore(store)` — the counterpart, marked
  `publishesBeforeWrite: false`, for the settings that stay the reader's own. The two markers are
  mutually exclusive, so a control says which kind of setting it edits and cannot be handed the other.
- `createTeamSharedSettings({ settings, bindings, source, client, logger })` — assembles the stack and
  returns `{ settings, personal, synchronizer, local }`. Callers pass the plain store **inline** and
  never bind it, so every store in scope on the options page says what it is.

## Personal settings

`PERSONAL_SETTING_KEYS` (`common/settings`) lists the settings that belong to the person rather than
the team — today `theme` and `defaultView`. They still sync across that user's own devices, and a
file export still carries them, because a file backs up one person's configuration. They are excluded
in three places, so a teammate can neither receive nor impose them:

- `exportCompactConfig` omits them, so publishing never sends them.
- `TeamConfigSynchronizer` strips them from a pull, so a payload published by an older build cannot
  still apply them.
- `overlaySettings` (`content/shared-query`) strips them, so opening someone else's shared query never
  repaints the reader's page.

Connected content scripts pull when a saved query opens. Every **team** settings edit made on the
options page publishes automatically, because the work-item payload is the team-shared source of
truth. Two flows deliberately do **not** publish and use `LocalSettingsAccess` instead: applying a
pull (it would echo the snapshot just read) and importing a file (it would push the outgoing
configuration into the connection the import is moving away from). The source work item and shared
queries must be in the same Azure DevOps organization, and every viewer needs read access to that
item.

## Shared queries (read-only, one query at a time)

A saved-query URL can carry `?awesomeAdoConfig={workItemId}` (see `common/navigation/SharedQueryLink`).
Opening such a link means one of two things, and the difference is decided by Azure DevOps' own team
roster rather than by anything in the link:

- **Recipient is on the item's team** \u2014 the item becomes their configuration source outright, exactly
  as if they had connected on the options page.
- **Recipient is not on that team, or membership could not be determined** \u2014 they get a **read-only
  link for that one query**. Their settings, their bindings, and any team they do belong to are left
  completely alone. An undetermined answer takes this narrow path on purpose: an unread roster is not
  permission, and the narrow outcome changes nothing the user owns.

- `SharedQuerySourceStore` / `BrowserSyncSharedQuerySourceStore` \u2014 the synced `queryId \u2192 workItemId`
  map of those read-only links, with `read`/`link`/`unlink`/`observe`. Distinct from
  `TeamConfigSourceStore` because that one governs the whole configuration while this governs one
  query.
- `createSharedQuerySourceStore(logger?)` \u2014 composition factory backed by `ChromeSyncStorage`.
- `normalizeSharedQuerySources(raw)` \u2014 drops any entry that does not name a positive work item id.
- `SharedQueryConfigResolver` \u2014 reads a configuration work item **at most once per resolver**, failed
  reads included. That memoization is the feature, not an optimization: several queries in one team
  are commonly shared from the same item, and re-reading it per query multiplies a credentialed round
  trip for an answer that cannot differ. `invalidate()` is how an explicit refresh gets a fresh
  answer. It refuses a connection-only payload, which names a source instead of being one.
- `SharedQueryLinkService` \u2014 makes the member/non-member decision above and applies it, delegating
  the membership question to `common/ado/TeamMembership` and the "adopt this item" step to an
  injected callback (which writes the trusted source and pulls).

The content-side application of all this lives in `src/content/shared-query`; the options-side
read-only presentation lives in `src/options/query-bindings`.
