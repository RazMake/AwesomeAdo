# src/options/ado-config

The options page's **Azure DevOps** tab: the organization/project scope and the team, sprint,
work-item-type-to-board-state, and marker-tag configuration.

## Purpose

Lets the user configure the Azure DevOps context the enhanced view needs. It owns the editable
organization and project boxes, drives a searchable team picker, the future- and past-sprint counts,
the per-work-item-type board-state mapping table, and the per-condition marker tags, persisting
everything to the synced settings store.

This component does not log; it surfaces failures through the options page's shared error sink.

## Public API

### `AzureDevOpsController.ts`

- **`AzureDevOpsController`** — controls the Azure DevOps tab end to end, coordinating the
  organization/project fields, the team combobox, sprint counts, and the nested work-item-types and
  marker-tags sub-controllers.
  It reads the stored settings once at `init()` and then treats its own controls as the working copy,
  so **`reload()`** re-reads them without re-wiring anything — call it when the stored configuration
  is replaced from outside the tab (a configuration file import), or the tab keeps showing, and on
  the next edit re-saves, the configuration that was replaced. It deliberately does not re-read the
  ADO metadata, which describes the tab the user has open and no import can change.
  The **current-team picker and the type table stay disabled while ADO is unreachable** (the metadata
  read answered `null`), since neither can offer a real value then; every other control on the tab
  edits stored values and stays usable.
- **`AzureDevOpsElements`** — the DOM elements the controller drives, passed in so it stays testable.

### `DetectedValueField.ts`

- **`DetectedValueField`** — one editable text setting the open ADO query tab can also answer for,
  used here for both the organization and the project. Call `render(value)` with the stored value and
  `setDetected(value)` with what the tab reports, in either order: while nothing is stored the tab's
  value is adopted and saved, and after that a differing tab value is only **offered** as a one-click
  "Use this" proposal below the box. The proposal disappears once the two agree or once there is no
  tab to read. A rejected write restores the last saved value.
- **`DetectedValueElements`** — the box and the container the proposal row is drawn into.

### `MarkerTagsController.ts`

- **`MarkerTagsController`** — nested controller (owned by `AzureDevOpsController`) for the
  **Marker tags** section. It renders one row per recognized condition (blocked, blocked by another
  team, interrupt) from the shared `WORK_ITEM_MARKERS` list, binding each condition's Azure
  DevOps **tag** and **comment tag** to the `markerTags` setting it owns. An edit is persisted as a
  **targeted patch**: the edited control names its own marker (its row) and field (its role), and
  every other marker is carried over from the last accepted state rather than re-read from the DOM,
  so a value can never be stored under a neighbouring marker. A failed write restores the last
  accepted values so the fields never show a value the store rejected. A non-blank **comment tag**
  that duplicates another marker's is rejected and the field is restored, since a note is attributed
  to its marker by that token.
- **`MarkerTagsElements`** — the container element it fills with the marker rows.

### `WorkItemTypesController.ts`

- **`WorkItemTypesController`** — nested controller (owned by `AzureDevOpsController`) for the
  work-item-type-to-board-column mapping table. It also owns two **read-only sections driven by that
  table**: an **ETA section** listing each committed type with a dropdown of that type's date fields
  (from ADO metadata), and the **hierarchy section** (`WorkItemHierarchyController`). Both are stored
  on the same `workItemTypes` setting this controller already writes, so a single writer keeps all
  three in sync. Both lists are driven by the table: types appear once committed above and cannot be
  added or removed from either section itself.
  - Each board column header shows the **meaning** its position carries to the views
    (`BOARD_COLUMN_MEANINGS`), above the editable title and repeated as the title's tooltip, because
    the views read a column by position and a renamed title otherwise says nothing about what it
    drives.
  - Every mapping cell keeps its state picker folded behind a **`+`** button (the same control the
    hierarchy section uses); the `+` disappears entirely once the row has no unplaced state left, or
    before its work item type is chosen.
  - **Row order is meaningful.** Types are added from parent to child, top-most parent first (Epic →
    Feature → User Story → Task). Each row has a grip handle (drag it) that reorders the row; the
    table's top-to-bottom order defines the hierarchy. The order flows straight through: the ETA list
    re-renders to match, `collect()` reads rows in table order, and both save and config import
    preserve it (the `workItemTypes` array keeps its order end to end).
- **`WorkItemTypesElements`** — the mapping-table, ETA-section, and hierarchy-section elements it
  drives.

### `WorkItemHierarchyController.ts`

- **`WorkItemHierarchyController`** — nested controller (owned by `WorkItemTypesController`) for the
  **Work item type hierarchy** section. It renders one row per committed type, listing the types that
  may be created underneath it and a **Primary work** checkbox. Primary work means independently
  trackable delivery; unchecked types above it are planning context and unchecked types below it are
  implementation details. The root checkbox is always cleared and disabled. Child types are shown
  as removable, drag-reorderable chips; the **first** chip is the type a
  view creates when the user adds a child. Each row's picker stays folded behind a **`+`** button and
  only unfolds when it is clicked. Because the table above is ordered parent-to-child, a row is only
  offered the types listed **below** it, minus any that would still loop back and minus its
  **siblings** (types already listed under the same parent), so the hierarchy stays acyclic and the
  last type has no `+` at all. A type with no children shows the UX-only
  **`Leaf Item`** marker, which is never stored. The controller never writes settings — it reports
  every edit through its `onChange` callback so `WorkItemTypesController` remains the single writer of
  `workItemTypes`.
- **`WorkItemHierarchyElements`** — the table body and empty-state notice it fills.

### `typeLabel.ts`

- **`createTypeLabel`** — builds the shared work-item-type label (ADO's own icon beside the type name
  in ADO's own color) used by every read-only list that mirrors the work-item-types table.
- **`LabeledType`** — the name/color/icon subset the label needs.

### `AutocompleteInput.ts`

- **`AutocompleteInput`** — a reusable searchable single-select combobox with a filtered dropdown and
  no business logic. Used here for the team picker and the work-item-type inputs; co-located with its
  primary consumer.
- **`RenderOption`** — the hook callers pass to customize how each option row is rendered.

### `roleInput.ts`

- **`createRoleInput`** — builds a `data-role`-tagged text input the same way for the area-path and
  marker-tag rows, so a single delegated container listener can dispatch on each control's role.
- **`ROLE_ATTRIBUTE`** — the shared `data-role` attribute name both sections agree on.

## Usage guidance

Construct `AzureDevOpsController` at the options composition root with the shared settings store, the
ADO metadata reader, the elements, and the page's `report` error sink (see `src/options/index.ts`).
