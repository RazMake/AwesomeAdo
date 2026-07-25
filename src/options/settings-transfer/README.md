# `options/settings-transfer`

Wires the Appearance tab's **Import / Export** controls to both the settings store and the query
binding store, so one file captures and restores the user's whole configuration. The file format
and the pure serialize/parse logic live in
[`common/settings-transfer`](../../common/settings-transfer/README.md); this controller is only the
options-page glue.

## Public API

### `SettingsTransferController.ts`

- `SettingsTransferElements` — the elements the controller drives: `exportButton`, `importButton`,
  the hidden `fileInput`, and a `status` line.
- `new SettingsTransferController(settingsStore, bindingStore, elements, reportError?)` — construct
  with the two store abstractions.
  - `init()` — attach the click/change listeners.
  - `dispose()` — detach them and stop updating status.

**Export** reads both stores, builds the `AwesomeADO.config` JSON, and downloads it. **Import** opens
the hidden file input, reads the chosen file, and — only if it parses as a valid config — writes the
settings and **replaces** all bindings (`replaceAll`), so the imported file is authoritative rather
than merged. An invalid file is reported and never touches either store.

Like the Diagnostics log export, the download and file read use ambient browser APIs (`Blob`, `URL`,
the file input) directly; only `chrome.*` is injected, and that reaches the controller through the
injected store abstractions.
