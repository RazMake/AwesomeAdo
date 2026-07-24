# src/options/ado-config

The options page's **Azure DevOps** tab: organization/project detection and the team, sprint, area
path, and work-item-type-to-board-state configuration.

## Purpose

Lets the user configure the Azure DevOps context the enhanced view needs. It detects the active
org/project, drives a searchable team picker, the future-sprint count, the pinned area-path list, and
the per-work-item-type board-state mapping table, persisting everything to the synced settings store.

This component does not log; it surfaces failures through the options page's shared error sink.

## Public API

### `AzureDevOpsController.ts`

- **`AzureDevOpsController`** — controls the Azure DevOps tab end to end, coordinating the team
  combobox, area paths, sprint count, and the nested work-item-types table.
- **`AzureDevOpsElements`** — the DOM elements the controller drives, passed in so it stays testable.

### `WorkItemTypesController.ts`

- **`WorkItemTypesController`** — nested controller (owned by `AzureDevOpsController`) for the
  work-item-type-to-board-column mapping table.
- **`WorkItemTypesElements`** — the mapping-table elements it drives.

### `AutocompleteInput.ts`

- **`AutocompleteInput`** — a reusable searchable single-select combobox with a filtered dropdown and
  no business logic. Used here for the team picker and the work-item-type inputs; co-located with its
  primary consumer.
- **`RenderOption`** — the hook callers pass to customize how each option row is rendered.

## Usage guidance

Construct `AzureDevOpsController` at the options composition root with the shared settings store, the
ADO metadata reader, the elements, and the page's `report` error sink (see `src/options/index.ts`).
