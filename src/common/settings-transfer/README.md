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
- `ImportedConfig` — the normalized `{ settings, enhancedQueries }` an import yields.
- `exportConfig(settings, enhancedQueries)` — serialize to the exact indented JSON text written to
  the file. Values pass through the same normalizers used on storage reads, so an export is always a
  clean snapshot.
- `importConfig(text)` — parse and validate a selected file's text. Throws a clear `Error` when the
  text is not JSON or is not shaped like an AwesomeADO config, so importing an unrelated file cannot
  silently wipe settings to defaults. Recognized files are normalized, so a hand-edited or
  newer-version file can never persist a malformed setting or binding.

Import writes are applied to the two stores by the caller: settings via `ISettingsStore.write`, and
bindings via `IQueryBindingStore.replaceAll` (a wholesale replace, not a merge).
