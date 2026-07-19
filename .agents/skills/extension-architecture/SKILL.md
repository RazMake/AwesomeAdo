---
name: extension-architecture
description: Procedural checklist for locating the owning component, contracts, and composition root in the AwesomeADO extension.
---

# Extension Architecture Skill

Read [AGENTS.md](../../../AGENTS.md) before proceeding. This skill adds workflow detail without
copying rule bodies.

## When to use this skill

- Adding a new feature, class, or module
- Deciding where a file belongs
- Checking if a dependency is injected correctly

## Checklist

1. **Locate the owning component.** Match the feature to one of:
   - `src/common/browser/` — browser storage abstraction
   - `src/common/navigation/` — ADO SPA navigation detection
   - `src/common/settings/` — user settings contract + store
   - `src/content/` — page-mutation logic
   - `src/options/` — options page UI
   - `src/background/` — service worker event wiring
   - `scripts/` — build and release automation (not bundled into the extension)

2. **Check for an existing interface.** Does `IBrowserSyncStorage`, `ISettingsStore`, or another
   interface in `src/common/**` already cover the behavior? If yes, implement against it. If not,
   define a new focused interface in the owning component per **Interface Segregation** (see
   `SOLID principles` in AGENTS.md).

3. **Keep concrete browser APIs out of feature code.** According to **Dependency Inversion** (see
   AGENTS.md), inject `chrome.*` only at the composition root (`createSettingsStore.ts`,
   `src/**/index.ts`). Feature classes accept interfaces, not `chrome.*` directly.

4. **Single Responsibility check.** Each class has exactly one reason to change (see AGENTS.md
   `SOLID principles`). If a class does more than one thing, split it.

5. **DRY check.** If logic is used in more than one feature, move it to `src/common/**` and import
   it (see AGENTS.md `DRY & the common folder`). Run `pnpm duplication` to confirm.

6. **README update.** Every subfolder under `src/common/**` must have a `README.md` explaining
   public API and usage intent (see AGENTS.md folder conventions). Update it if you add public
   exports.

## References

- SOLID principles: see AGENTS.md §3.1
- DRY & common: see AGENTS.md §3.2
- Composition root pattern: `src/**/index.ts`, `src/common/settings/createSettingsStore.ts`
