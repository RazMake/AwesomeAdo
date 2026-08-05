---
name: changelog-versioning
description: "Continuously maintain user-facing AwesomeADO release notes and cut versions. Use when work changes user-visible behavior, updates ChangeLog.md, or bumps a release version."
---

# Changelog & Versioning Skill

Read [AGENTS.md](../../../AGENTS.md) before proceeding. Mandatory rules are in
**Versioning & changelog rules** (§12).

## Continuously accumulating release notes

Do not wait for release preparation to reconstruct what changed. For every task:

1. At the start, read the existing `## Next Version` section and classify the task as user-visible
   or internal.
2. For user-visible work, draft the release outcome as soon as the intended behavior is understood,
   and decide which group it belongs in — `New Features` or `Bug Fixes`.
3. Before final verification, the serial coordinator writes or merges that outcome into the right
   group of `## Next Version`. Extend an existing capability bullet instead of adding a chronological
   update.
4. For internal-only work, record `None` and do not add a changelog bullet.

Parallel workers **return** proposed input in their §4.1 response; they do not edit `ChangeLog.md`
directly. The serial coordinator owns the shared changelog edit. Format:

```markdown
## Next Version

### New Features

- <a new or expanded capability, in the words users would use for it>
- **WIP** — <a capability that is not finished yet>

### Bug Fixes

- <behavior that was broken or misleading, and what works now>
```

## Grouping rules

- Group headings are **H3** (`### New Features`, `### Bug Fixes`) inside each version section.
  Never H2: `scripts/compute-version.mjs` treats every `## ` heading as a new version section, so an
  H2 group heading would truncate the section the release gate is validating.
- **A group with no bullets does not appear at all.** Add the heading only when writing the first
  bullet under it, and remove a heading if its last bullet moves away. A freshly cut
  `## Next Version` has no group headings.
- `### New Features` — new capability, expanded capability, improved behavior.
- `### Bug Fixes` — behavior that was broken, misleading, or lost work, and now behaves correctly.
- Order: `### New Features` first, then `### Bug Fixes`.
- An unfinished feature is still staged, under `### New Features`, prefixed `- **WIP** — `. Remove
  the marker when the work lands; no `**WIP**` bullet may remain in a section being released.

## Writing the bullets

Write release notes at the level users experience them:

- Write for extension users who do not know the codebase. Prefer visible feature, control, and
  workflow names; omit classes, files, APIs, storage, transport, tests, and internal safeguards.
- Use one bullet per coherent capability or meaningful fix.
- Combine related implementation changes and minor UX rearrangements into the capability they
  support; do not mirror development chronology.
- Keep independent user-visible outcomes as separate bullets.
- Exclude refactors, tests, tooling, and internal architecture unless users or operators experience
  a changed outcome.
- For an initial release, summarize the finished product rather than listing each development step.

The serial coordinator may merge, rewrite, or omit worker proposals to enforce this release-level
shape, but every completed user-visible outcome must remain represented before the task is complete.

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
   above it — empty means the heading alone, with no group headings under it yet.
3. Resolve every `**WIP**` bullet in the section being released: finish the work and drop the
   marker, or move the bullet up into the new `## Next Version`.
4. CI requires an exact `## <base>` heading with at least one `- ` bullet before it can create
   the first official `vX.Y` release.

Maximum Build component: 65 535. Bump Major or Minor before that limit.

## Checking release inputs

Before creating a release:

- Keep `## Next Version` as the staging section and use `Major.Minor` headings for released
  sections, never the full `Major.Minor.Build` package version.
- `ChangeLog.md` must contain exactly one `## <base>` section (e.g., `## 0.1`) with at least one
  `- ` bullet before the next `## ` heading. Bullets under `### New Features` / `### Bug Fixes`
  count, because H3 headings do not close the version section.
- `package.json` version must be `Major.Minor.Patch` (e.g., `0.1.0`).
- `scripts/compute-version.mjs` validates these at release time.

## References

- Versioning rules: AGENTS.md §12
- compute-version logic: `scripts/compute-version.mjs`
- ChangeLog location: `ChangeLog.md`
