# `common/settings-transfer`

Serializes the user's **entire** configuration to and from a single `AwesomeADO.config` file, so a
user can back it up or move it between machines. The file carries every extension setting (theme,
default view, current team, sprint counts, area paths, board columns, work item types) **and** every
enhanced-query binding (which queries are enhanced and each one's per-view property values).

This component is pure data plumbing: no DOM, no `chrome.*`. The options-side controller that wires
it to buttons and the two stores lives in `src/options/settings-transfer`.

## Public API

### `AwesomeAdoConfig.ts`

- `CONFIG_FILE_NAME` — `"AwesomeADO.config"`, the proposed download name.
- `CONFIG_FORMAT_VERSION` — the format version stamped into every export.
- `AwesomeAdoConfig` — the on-disk file shape: `{ awesomeAdoConfigVersion, settings, enhancedQueries }`.
- `ConfigImportError` — an `Error` carrying `problems: readonly string[]`, every fault in one throw.
- `ImportedConfig` — what an import yields: `{ settings, enhancedQueries, problems }`, where
  `settings` is a **`Partial<ExtensionSettings>`** holding only the settings the file supplied
  usably, and `problems` lists everything the file got wrong.
- `exportConfig(settings, enhancedQueries, teamConfigWorkItemId?)` — serialize to the exact indented
  JSON text written to the file. Values pass through the same normalizers used on storage reads, so
  an export is always a clean snapshot. The optional trusted source ID is included in file exports.
- `exportCompactConfig(settings, enhancedQueries)` — serialize the same normalized shape without
  indentation or presentation whitespace for the team configuration work item Description.
- `importConfig(text)` — parse a selected file's text and salvage as much of it as possible. Every
  setting and binding the file describes usably is returned (normalized, so nothing malformed can be
  persisted); each one it got wrong is left out and described in `problems` instead — a single bad
  value costs the user that one value, not the whole import, and a setting the file omits or gets
  wrong keeps whatever the user has configured today. Throws `ConfigImportError` only when the file
  yields nothing at all (not JSON, not an object, or missing a whole section), so importing an
  unrelated file cannot wipe settings to defaults.

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
- `createTeamConfigSourceStore(logger?)` — composition factory backed by `ChromeSyncStorage`.
- `TeamConfigReader` / `TeamConfigWriter` — focused transport contracts for Description reads and
  revision-guarded publishes.
- `TeamConfigSynchronizer` — pulls through `importConfig`, refuses partial/invalid remote files,
  reports an empty Description as connected but not yet published without changing local settings,
  replaces settings and bindings only when the normalized snapshot changed, and publishes the current
  full `exportCompactConfig` snapshot. Concurrent pulls share one in-flight operation.

Connected content scripts pull when a saved query opens. Publishing is always an explicit options
action: local edits never become team edits automatically. The source work item and shared queries
must be in the same Azure DevOps organization, and every viewer needs read access to that item.
