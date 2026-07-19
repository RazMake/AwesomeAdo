---
name: changelog-versioning
description: Steps for proposing a changelog bullet and checking release inputs for AwesomeADO.
---

# Changelog & Versioning Skill

Read [AGENTS.md](../../../AGENTS.md) before proceeding. Mandatory rules are in
**Versioning & changelog rules** (§3.8).

## Proposing a changelog bullet

Every logical user-visible change proposes one bullet for `## Next Version` in `ChangeLog.md`.
Parallel workers **return** the bullet in their §4.1 response; they do not write to `ChangeLog.md`
directly (only the serial coordinator edits shared files). Format:

```markdown
## Next Version

- <concise description of what changed and why it matters to users or operators>
```

Do not combine multiple independent changes in one bullet.

## Version scheme

```
Major.Minor.Build
```

- **Major.Minor** — set by the developer in `package.json` (`version`) and `versionBuildOffset`.
- **Build** — computed by CI: `github.run_number - versionBuildOffset`.
- Local builds (no `BUILD_NUMBER` env var) always produce build `0` (e.g., `0.1.0`).

## Bumping Major or Minor

When bumping:

1. Set `versionBuildOffset` in `package.json` to the latest CI `github.run_number` seen before
   the bump.
2. Rename `## Next Version` to `## X.Y` in `ChangeLog.md` and add a new empty `## Next Version`
   above it.
3. CI requires an exact `## <base>` heading with at least one `- ` bullet before it can create
   the first official `vX.Y` release.

Maximum Build component: 65 535. Bump Major or Minor before that limit.

## Checking release inputs

Before creating a release:

- `ChangeLog.md` must contain exactly one `## <base>` section (e.g., `## 0.1`) with at least one
  `- ` bullet before the next `## ` heading.
- `package.json` version must be `Major.Minor.Patch` (e.g., `0.1.0`).
- `scripts/compute-version.mjs` validates these at release time.

## References

- Versioning rules: AGENTS.md §3.8
- compute-version logic: `scripts/compute-version.mjs`
- ChangeLog location: `ChangeLog.md`
