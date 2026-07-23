# src/common/settings

This folder contains the settings layer for the AwesomeADO extension.

## Purpose

The settings layer maps user-configurable options to browser-synced storage, making them
available to all extension pages (content script, options page, service worker).

## Public API

### `ExtensionSettings` (interface) — `ExtensionSettings.ts`

The shape of user settings:

```typescript
interface ExtensionSettings {
  theme: Theme; // "auto" | "light" | "dark" | "blue"  (default: "auto")
  defaultView: DefaultView; // "original" | "enhanced"        (default: "enhanced")
  currentTeam: TeamRef | null; // selected ADO team, or null       (default: null)
  futureSprintsCount: number; // sprints offered past the current one, 1..12 (default: 6)
  areaPaths: AreaPath[]; // pinned area paths, each { path, label }  (default: [])
}
```

`ExtensionSettings.ts` also exports the `Theme` and `DefaultView` unions, the `TeamRef` /
`AreaPath` shapes, the `THEMES` / `DEFAULT_VIEWS` value lists (used to populate the options
selects), the `MIN_FUTURE_SPRINTS` / `MAX_FUTURE_SPRINTS` bounds, and `DEFAULT_SETTINGS`.
`normalizeSettings(raw)` validates each field independently and falls back to the default when a
value is missing or unrecognized. The focused helpers `normalizeFutureSprintsCount(raw)` (clamps to
`1..12`), `normalizeAreaPaths(raw)` (drops pathless/duplicate entries), and
`defaultAreaPathLabel(path)` (the path's last `\`-separated segment) are exported for the options
UI so a stored value and a freshly typed one derive the same default.

### `ISettingsStore` (interface) — `ISettingsStore.ts`

The abstraction that features depend on:

```typescript
interface ISettingsStore {
  read(): Promise<ExtensionSettings>;
  write(update: Partial<ExtensionSettings>): Promise<void>;
  observe(listener: (settings: ExtensionSettings) => void): {
    ready: Promise<void>;
    unsubscribe: () => void;
  };
}
```

- `read()` — returns the current settings, normalized.
- `write(update)` — persists changed fields only; unspecified fields keep their stored value.
- `observe(listener)` — subscribes before reading the initial snapshot. `ready` resolves after
  the first normalized snapshot is emitted; it rejects if the initial read fails. Call
  `unsubscribe()` to stop receiving updates.

### `createSettingsStore()` — `createSettingsStore.ts`

The composition root factory. Call this in `src/**/index.ts` entry files:

```typescript
import { createSettingsStore } from "../common/settings/createSettingsStore";

const store = createSettingsStore();
const settings = await store.read();

const { ready, unsubscribe } = store.observe((settings) => {
  console.warn("settings changed:", settings);
});
await ready;
// later:
unsubscribe();
```

## The settings

- **`theme`** picks the visual theme the options page paints. `auto` follows Azure DevOps' own
  active theme (detected from the live Query tab); `light`, `dark`, and `blue` pin a specific
  theme regardless of what ADO is using.
- **`defaultView`** decides what the content script shows on an ADO Query page. `enhanced`
  (default) lets the extension take over the page below the breadcrumb bar; `original` leaves ADO
  untouched.
- **`currentTeam`** is the ADO team (`{ id, name }`) whose sprints drive the sprint picker and the
  "current sprint" default, or `null` when the user has not chosen one. The name is stored alongside
  the id so the options page can label the saved team even when no ADO tab is open.
- **`futureSprintsCount`** is how many sprints past the current one the picker offers, clamped to
  `1..12` (default `3`).
- **`areaPaths`** is the list of area paths the user pinned, each with a short `label` (defaults to
  the path's last segment).

All values sync across all of the user's devices via `chrome.storage.sync`.

## Why per-setting keys?

Each setting maps to its own storage key (e.g., `settings.theme`, `settings.defaultView`,
`settings.currentTeam`, `settings.futureSprintsCount`, `settings.areaPaths`). This means adding a new
setting in a future version does not risk a read-modify-write race overwriting the new key with
`undefined` on older installs still using a full-settings-object key.
