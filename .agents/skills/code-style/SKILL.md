---
name: code-style
description: Formatter/linter workflow and naming/documentation conventions for the AwesomeADO extension.
---

# Code Style Skill

Read [AGENTS.md](../../../AGENTS.md) before proceeding. Mandatory rules are in
**Naming & readability** (§7), **Documentation** (§8), and **Definition of done** (§4).

## Formatter/linter workflow

Auto-fix staged files on commit (husky + lint-staged) and the full tree on demand:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"

# Check formatting on owned files
pnpm exec prettier --check "src/common/browser/**"

# Check ESLint on owned directory
pnpm exec eslint src/common/browser

# Auto-fix and reformat
pnpm format
pnpm lint:fix
```

Full gate (run only at a serial wave barrier, never while sibling workers edit):

```powershell
pnpm verify
```

## Naming rules (summary)

- Names state intent: `blankQueryPage`, `PageBlanker.apply`, `readSettings`.
- The `I` prefix is used **only** for the two interfaces `ISettingsStore` and `IBrowserSyncStorage`.
  Do not add `I` to any other name.
- Avoid abbreviations. No Hungarian notation. No type-encoding in names.

Full rules: AGENTS.md §7.

## Documentation rules (summary)

- Comments explain **why**, not what. Avoid narrating code.
- Good: `// A document-level rule also covers content ADO renders after initial load.`
- Bad: `// increment i`

Full rules: AGENTS.md §8.

## References

- Naming: AGENTS.md §7
- Documentation: AGENTS.md §8
- Definition of done: AGENTS.md §4
