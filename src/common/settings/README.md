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
  pastSprintsCount: number; // sprints offered before the current one, 0..6 (default: 0)
  boardColumns: string[]; // mapping-table columns, fixed set of 5 (default: In Queue/In Progress/Waiting/Done/Removed)
  workItemTypes: WorkItemType[]; // per-type board mapping + hierarchy/classification (default: [])
  markerTags: WorkItemMarkerTags; // per-condition ADO tag + comment token   (default: DEFAULT_MARKER_TAGS)
}
```

`ExtensionSettings.ts` also exports the `Theme` and `DefaultView` unions, the `TeamRef`,
`WorkItemType` / `WorkItemColumn` shapes, the `BOARD_COLUMN_COUNT` count and
`DEFAULT_BOARD_COLUMNS` fixed list, the `WorkItemMarker` / `MarkerTags` / `WorkItemMarkerTags` shapes,
the `WORK_ITEM_MARKERS` ordered marker list (key + UI label) and its `DEFAULT_MARKER_TAGS` seed, the
`THEMES` / `DEFAULT_VIEWS` accepted-value lists, the `MIN_FUTURE_SPRINTS` /
`MAX_FUTURE_SPRINTS` and `MIN_PAST_SPRINTS` /
`MAX_PAST_SPRINTS` bounds, and `DEFAULT_SETTINGS`.
`normalizeSettings(raw)` validates each field independently and falls back to the default when a
value is missing or unrecognized. The focused helpers `normalizeFutureSprintsCount(raw)` (clamps to
`1..12`), `normalizePastSprintsCount(raw)` (clamps to `0..6`),
`normalizeBoardColumns(raw)` (coerces to the fixed
`BOARD_COLUMN_COUNT` positions, keeping each stored title by position and filling blanks/collisions
from `DEFAULT_BOARD_COLUMNS`), and `normalizeWorkItemTypes(raw)` (drops
nameless/duplicate types and empty-state/duplicate columns, routes each state to a single column,
keeps a trimmed per-type `etaField` only when set, and prunes every `children` link that names an
unknown type or would close a cycle; it also preserves `isPrimaryWork: true` only on non-root types)
are exported for the options UI so a stored value
and a freshly typed one derive the same default.
`normalizeMarkerTags(raw)` (seeds the full `DEFAULT_MARKER_TAGS` for a never-set value, seeds only the
missing markers from a partial object, and trims both tokens while honoring a deliberately blanked
entry) is likewise exported for the options UI.
`isAdoConfigured(settings)` reports whether the Azure DevOps settings are complete enough for the
extension to enhance a query (a current team and at least one work item type that maps a state); the
content script and options page share it.

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

- **`theme`** picks the visual theme used by both options and enhanced views. `auto` detects whether
  the live ADO tab is dark or light and selects AwesomeADO's corresponding theme; `light`, `dark`,
  and `blue` pin a specific theme. Blue is never selected by `auto`.
- **`defaultView`** decides what the content script shows on an ADO Query page. `enhanced`
  (default) lets the extension take over the page below the breadcrumb bar; `original` leaves ADO
  untouched.
- **`currentTeam`** is the ADO team (`{ id, name }`) whose sprints drive the sprint picker and the
  "current sprint" default, or `null` when the user has not chosen one. The name is stored alongside
  the id so the options page can label the saved team even when no ADO tab is open.
- **`futureSprintsCount`** is how many sprints past the current one the picker offers, clamped to
  `1..12` (default `3`).
- **`pastSprintsCount`** is how many sprints before the current one the picker offers, clamped to
  `0..6` (default `0`, i.e. only the current and future sprints are shown).
- **`boardColumns`** is the ordered set of columns that form the header of the work-item mapping
  table — the team's own "application states". It is a **fixed set** of `BOARD_COLUMN_COUNT` columns
  shared by every work item type; only each column's _title_ is user-editable (rename — columns
  cannot be added or removed). A fresh install seeds `DEFAULT_BOARD_COLUMNS` (`In Queue`,
  `In Progress`, `Waiting`, `Done`, `Removed`); the first column is the fallback bucket for any ADO
  state a type does not explicitly map. `BOARD_COLUMN_MEANINGS` states what each **position** means
  to the views (work on the item has not started yet, someone is working on the item, …); the options UI shows it above each
  renameable title, since behaviour follows the position and never the title.
- **`workItemTypes`** is the list of work item types the team uses. Each entry stores the type's ADO
  `name`, `color`, and `icon` URL (so a row renders even with no ADO tab open) plus its `columns`:
  an ordered list of `{ column, states }` that maps the type's ADO states onto the user's
  `boardColumns`. A state is placed in at most one column, and the first `states` entry is that
  column's _primary_ state (the value written back to ADO). Each entry may also carry an optional
  `etaField` — the ADO date field surfaced as that type's "ETA" (e.g.
  `Microsoft.VSTS.Scheduling.TargetDate`). It is per-type with no global default, and is omitted
  from storage when left blank. An entry may finally carry `children`: the types that can be created
  underneath it, in priority order, where the **first** is the one a view creates when the user adds
  a child. It is omitted for a leaf, and the stored graph is always acyclic. `isPrimaryWork: true`
  classifies a type as independently trackable delivery. Unchecked types above it provide planning
  context; unchecked types below it are implementation details. The first/root type is always
  planning context, so normalization removes `isPrimaryWork` from it.

### `workItemHierarchy.ts`

`reachesWorkItemType(links, start, target)` answers "would adding this parent→child link close a
loop?". The normalizer uses it to prune stored and imported links; the options picker uses it to
refuse to offer one — so both apply exactly the same rule. Names are compared lowercased.

All values sync across all of the user's devices via `chrome.storage.sync`.

## Why per-setting keys?

Each setting maps to its own storage key (e.g., `settings.theme`, `settings.defaultView`,
`settings.currentTeam`, `settings.futureSprintsCount`, `settings.pastSprintsCount`,
`settings.boardColumns`, `settings.workItemTypes`, `settings.markerTags`). This means adding a new
setting in a future version does not risk a
read-modify-write race overwriting the new key with `undefined` on older installs still using a
full-settings-object key.
