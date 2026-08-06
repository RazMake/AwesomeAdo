# AGENTS.md

This is the **single canonical instruction file** for all AI agents (Claude Code, Codex, GitHub
Copilot, and any other tool) working in this repository. Every rule here is non-negotiable unless
explicitly overridden by a developer with a recorded ADR in `.agents/memory-bank/decisions.md`.

---

## 1. Project Overview

**AwesomeADO** is a Chrome + Edge (Chromium Manifest V3) browser extension that enhances Azure
DevOps Query pages. It is published to both the Chrome Web Store and the Microsoft Edge Add-ons
store from a single codebase.

**Phase 1 scope:** Infrastructure only — a barebone MV3 extension that blanks ADO Query pages via
one browser-synced boolean setting (`blankQueryPages`), full test coverage (≥ 85%), lint/format
enforcement, VS Code run/debug tasks, git hooks, and a CI/CD build + release pipeline with
changelog-validated versioning.

**Non-goals for Phase 1:** No on-prem ADO Server support, no additional features beyond the
blank-page proof of concept, extension icons deferred.

Remote repository: `github.com/RazMake/AwesomeAdo`

---

## 2. How to Work in This Repo

### Read current and relevant memory first

Before starting **any** task, read only the always-current entry set:

```
.agents/memory-bank/README.md       — protocol + index
.agents/memory-bank/projectbrief.md — north star + scope
.agents/memory-bank/activeContext.md — current state and live constraints
```

Then use the README index and targeted search to load only task-relevant sections from
`productContext.md`, `techContext.md`, `systemPatterns.md`, `progress.md`, `decisions.md`, and
`debuggingNotes.md`. Never eagerly load the complete ADR or debugging history. Do not re-read a file
already present in the current conversation context.

### Worker contract (§4.1)

Every parallel worker response must contain exactly these four headings in order:

1. **Files changed** — only files assigned to that stream.
2. **Local validation** — commands run and pass/fail results.
3. **Memory-bank delta** — completed work, remaining work, and decisions; `None` is valid.
4. **Changelog bullet** — one proposed bullet, named with the group it belongs under (`New Features`
   or `Bug Fixes`), or `None` for non-user-visible work.

Use this exact shape for the third heading:

```markdown
## Memory-bank delta

- Completed: <concise facts or None>
- Remaining: <concise pending work or None>
- Decisions: <notable decisions or None>
```

Worker acceptance criteria are intentionally local. Repository-wide `pnpm verify`, packaging,
release, authenticated browser behavior, and final memory updates belong to the one final serial
barrier after all implementation waves are stable.

---

## 3. Memory Bank / Coordinator Protocol

- **Read the entry set**, then search and read only relevant memory-bank sections, as defined in §2.
- **Parallel workers never edit** `activeContext.md`, `progress.md`, or `decisions.md` directly.
  Return a `Memory-bank delta` in the §4.1 response instead.
- **The serial coordinator** collects deltas throughout the task and applies them once immediately
  before the final verification barrier.
- Wave 0A is the only bootstrap exception: it creates the memory bank before later agents can read
  it.
- The memory bank is for **internal architecture and rationale**. Component `README.md` files
  (under `src/common/**`) are for **usage documentation** only — describe the public API and
  intent, not internal implementation.
- **Record durable repo knowledge only in source control, never in an agent-tool-local memory**
  (GitHub Copilot / Claude / Codex per-machine memory, or any equivalent). Tool-local memory does
  not clone or transfer between machines, agents, or teammates, so anything learned there is silently
  lost. Architecture and rationale go in `systemPatterns.md` / `decisions.md`; tactical bug findings,
  gotchas, and live-debugging recipes go in `.agents/memory-bank/debuggingNotes.md`. If you are about
  to write a lasting fact into a tool memory, write it into the memory bank instead.

---

## 4. Definition-of-Done Gate

> **No change is complete until `pnpm verify` passes.**

`pnpm verify` runs one parallel static wave (`format:check`, `lint`, `typecheck`, `duplication`,
`test:scripts`, and `validate:workflows`), followed by `test:coverage` with the ≥ 85% thresholds.
Prettier, ESLint, and TypeScript keep local caches under ignored `node_modules/.cache/`.

Run the full gate **once for each stable repository state**, immediately before final handoff. During
implementation and user-feedback iterations, run only the cheapest focused test, lint, typecheck, or
build that can falsify the current change. Do not run full coverage or `pnpm verify` at intermediate
wave boundaries. An ongoing visual-feedback iteration is provisional, not a final handoff.

The pre-push hook runs `pnpm verify:reuse`: it reuses a successful local gate only when a SHA-256
fingerprint proves the repository contents and Node runtime are identical. Otherwise it runs the full
gate. CI always runs a fresh `pnpm verify` on every push.

For repeated browser UI adjustments, keep the existing build watcher and CDP browser session alive;
reload the extension/page in place instead of rebuilding browser state. In a long feedback session,
compact or start a fresh chat with a concise handoff after roughly eight substantive turns when the
client supports it.

### Zero tolerance for lint warnings

Lint runs with `--max-warnings 0`, so a **warning fails the build exactly like an error**. There is
no such thing as an "acceptable" or "pre-existing" warning. When you touch the codebase you leave it
with **zero** ESLint warnings across `src/**`, `scripts/**`, and every test file — no exemptions.

- Fix warnings by **improving the code**, not by silencing it: extract well-named helpers to cut
  `complexity` and `max-lines-per-function`, group tests into cohesive sibling `describe` blocks with
  shared module-scope setup, etc. Never weaken a test assertion to shrink a function.
- Do **not** add blanket `eslint-disable` comments or per-file rule overrides to dodge a warning. A
  rule may only be relaxed by editing `eslint.config.js` with a recorded rationale (and, for a
  policy change, an ADR in `.agents/memory-bank/decisions.md`).
- `max-lines-per-function` counts **executable** lines only (`skipComments`/`skipBlankLines`), so the
  mandated "why" comments in §8 never push a function over budget — long functions are a real code
  smell, not a documentation artifact.

---

## 5. SOLID Principles

All extension runtime code under `src/**` must follow SOLID. These are **not suggestions**.

### S — Single Responsibility

Each class or module has exactly **one reason to change**.

Codebase examples:

- `ChromeSyncStorage` — only talks to `chrome.storage.sync`; never interprets what the data means.
- `BrowserSyncSettingsStore` — only maps typed settings ↔ raw storage key/value pairs.
- `PageBlanker` — only mutates the DOM (blanks or restores the page).
- `OptionsController` — only binds the options UI to the settings store.

### O — Open/Closed

Consumers depend on **interfaces** (`ISettingsStore`, `IBrowserSyncStorage`). New storage backends
or behaviours can be added without editing existing consumers.

### L — Liskov Substitution

Any `IBrowserSyncStorage` implementation (real Chrome or a test fake) must be **fully
interchangeable** everywhere the interface is used. If substituting an implementation breaks a
consumer, the design is wrong.

### I — Interface Segregation

Keep interfaces **small and focused**. The storage interface is separate from the settings
interface. Never create a "god" interface that forces implementors to satisfy contracts they do not
need.

### D — Dependency Inversion

High-level feature code depends only on **abstractions** (interfaces). Concrete browser APIs
(`chrome.storage.sync`, `chrome.webNavigation`, etc.) are injected **only** at the composition
roots:

- `createSettingsStore()` in `src/common/settings/createSettingsStore.ts`
- Entry files: `src/background/index.ts`, `src/content/index.ts`, `src/options/index.ts`

Do not instantiate chrome-backed objects anywhere else.

---

## 6. DRY & the `common` Folder

- **No duplicated code.** Extension runtime logic used by more than one feature must live under
  `src/common/**`.
- Build and release automation is **not** bundled into the extension; shared automation helpers
  such as `scripts/version.mjs` remain under `scripts/**`.
- Duplication is checked automatically by **jscpd** (`pnpm duplication`). A failing duplication
  check blocks the "done" gate.

---

## 7. Naming & Readability Rules

- Write code **for humans**. Use clear, short, intent-revealing names.
- Names state intent: `blankQueryPage`, `PageBlanker.apply`, `readSettings`, `notifyNavigation`.
- Avoid unclear abbreviations.
- The `I` prefix on `ISettingsStore` and `IBrowserSyncStorage` is the **sole** project-wide
  type-encoding exception. Do not add Hungarian notation or encode types into any other name.
- A component means a cohesive feature area (`common/settings`, `content/query-page`,
  `options/diagnostics`) — not each class within that area. Any component with more than one file
  lives in its own subfolder, including inside `content/` and `options/`.

---

## 8. Documentation Rules — "Why", Not "What"

- Comments explain **why** a decision was made, trade-offs, and non-obvious constraints.
- Do **not** narrate what the code literally does.
  - Bad: `// increment i`
  - Good: `// A document-level rule also covers content ADO renders after initial load.`
- Component folders under `src/**` (every subfolder of `common/`, `content/`, and `options/`) are
  documented for **usage** in their folder `README.md`: describe the public API and intent, not
  internal architecture.
- Internal architecture and rationale belong in the memory bank (`systemPatterns.md`), not in
  source-file comments.

---

## 9. Logging & Observability Rules

The extension ships a device-local diagnostics log (`src/common/logging`) so that **any** failure or
important runtime decision is traceable after the fact from the options page Diagnostics view. These
rules are **non-negotiable**.

### Every exception is logged

- It must be **impossible for the extension to fail without emitting an error log.** Every `catch`
  block — and every rejected-promise / error-callback boundary — records the failure via
  `ILogger.error(message, error)`, passing the original thrown value so its stack/detail is captured.
  `Logger` also mirrors errors to `console.error`, so a caught error is both persisted and visible in
  devtools.
- **Never swallow an error silently.** Catching to recover is fine; catching without logging is not.
- Logging is fire-and-forget by contract (`ILogger` returns `void` and never throws), so adding an
  error log can never break the path it guards. There is no excuse to skip it.

### Log the "why" behind every important decision

- Whenever code branches on runtime state in a way that changes user-visible behaviour (enhance vs.
  leave a page, show vs. hide UI, apply vs. skip a binding, take path A vs. B), log the **inputs**
  (the signals it read) **and the outcome** (which branch, plus a short reason). Execution must be
  reconstructable from the log alone — you should be able to answer "why did it do that?" without a
  repro.
- Respect the bounded ring buffer (`MAX_LOG_ENTRIES`, oldest dropped first): **dedupe** repeated
  identical conclusions and log a decision only when it **changes** (a flip), carrying the signals
  and the reason. High-churn, unchanged decisions must not flood out the errors that matter. See
  `QueryPageController` / `QueryBindingController` for the flip-dedupe pattern.
- Keep informational logging low-frequency for the same reason.

### Preserve the emitting source — never anonymous, never misattributed

- Every log line carries a `source` (the log "component"). **Never emit a log with no source**, and
  **never claim a source that did not emit the line.** A misattributed source makes the Diagnostics
  filter lie and defeats the whole point of the log.
- Feature code depends on the injected `ILogger` abstraction; a composition root mints it via
  `ILoggerFactory.forSource(source)`. `source` is a **string literal** (minification-safe — never
  `this.constructor.name`): the **owning component folder path** for component code
  (`common/settings`, `content/query-page`, `options/alerts`, …), or the **runtime context**
  (`background`, `content`, `options`) for composition-root wiring not tied to one folder.
- Each collaborator gets its **own** source-scoped logger at the composition root — do not hand one
  component's logger to another and let it log under the wrong name.
- Construct `Logger` / `LoggerFactory` / `BrowserLocalLogStore` **only** at a composition root
  (Dependency Inversion). The log is **device-local** (`chrome.storage.local`) and never synced;
  never log secrets or user identity — record setting/query names by identifier, not their values.

Full usage guidance lives in `src/common/logging/README.md`.

---

## 10. Testing Rules

These are **non-negotiable**.

- **Coverage ≥ 85%** for `src/**` (lines, functions, branches, statements). Falling below any
  threshold is a build failure.
- **No flaky tests.** Tests must be deterministic: no real timers, no network, no reliance on
  wall-clock ordering. Use injected fakes and `jsdom`.
- **A failing test is never acceptable.** Never use `skip`, `todo`, or `only` to hide a failing
  test. Never mark a test as an allowed/known failure. Vitest is configured with `retry: 0` so
  flakiness cannot be masked by re-runs. Fix the code or the test.
- Composition roots (`index.ts` files and `createSettingsStore.ts`) are **excluded from coverage
  thresholds** because they contain only wiring and are validated by the authenticated browser
  check in Wave 4.

---

## 11. Folder & README Conventions

- `./` is the existing workspace root — **never** create a nested project directory.
- Every component subfolder under `src/**` (each subfolder of `common/`, `content/`, and
  `options/`) **must** have a `README.md` describing how to use it (public API + intent). Internal
  architecture belongs in the memory bank.
- Entry files named `index.ts` contain **only composition/wiring** and are excluded from coverage.
- `common/view-common` is otherwise **DOM-free pure contracts**. Its **only** exception is
  `common/view-common/control/**`: the shared, theme-aware view controls (one folder per control)
  are the sole DOM-bearing code permitted under `common/`. Do not add DOM anywhere else in `common/`.
- `scripts/**` contains build and release automation only; it is never bundled into the extension.
- `store-assets/` contains marketplace listing files provided by the developer.

---

## 12. Versioning & Changelog Rules

- The **developer** owns `Major.Minor` and `versionBuildOffset`.
- **CI** computes `Build = github.run_number - versionBuildOffset`. Full version: `Major.Minor.Build`.
- Initial version base: `0.1`.
- `## Next Version` is the staging section; released section headings use `Major.Minor`, never the
  full `Major.Minor.Build` package version.
- Every version section groups its bullets under `### New Features` and `### Bug Fixes`. These are
  **H3**, never H2: the release gate in `scripts/compute-version.mjs` treats every `## ` heading as
  the start of a new version section, so an H2 group heading would end the section it belongs to.
- **Omit a group that has no bullets.** A section with only fixes has just `### Bug Fixes`; a
  section with only features has just `### New Features`. Never leave an empty heading behind.
- `### New Features` covers new or expanded capability and improved behavior. `### Bug Fixes`
  covers behavior that was broken, misleading, or lost work, and now behaves correctly.
- A feature that is not finished yet still goes under `### New Features`, with a `**WIP**` marker in
  front of the bullet text: `- **WIP** — <outcome>`. Drop the marker when the work is complete.
- Changelog entries describe **user-visible release outcomes**, not implementation chronology. Use
  one bullet per coherent capability or meaningful fix; consolidate related work and minor UX
  rearrangements into that capability's bullet.
- Write for extension users, not maintainers. Use product and UI language to explain what users can
  now do or what works better; omit classes, modules, APIs, storage, transport, tests, and internal
  safeguards unless a detail is necessary for users to understand the outcome.
- Exclude refactors, tests, tooling, and internal architecture unless they change what users or
  operators experience. An initial-release section summarizes the finished product rather than its
  development history.
- The changelog is maintained continuously, not reconstructed during release preparation. At the
  start of every task, classify it as user-visible or internal and read the existing `## Next Version`
  section before implementing user-visible work.
- Every completed user-visible task must be represented in `## Next Version` before final verification.
  Merge it into an existing capability bullet when appropriate; do not append implementation
  chronology. Internal-only work returns `None`. Parallel workers return proposed input in their §4.1
  response — naming the group the bullet belongs in — and the serial coordinator writes or merges it
  once before final verification, creating the group heading only if that group does not exist yet.
- When the developer bumps Major or Minor:
  1. Set `versionBuildOffset` to the latest CI workflow run number visible before the bump.
  2. Rename `## Next Version` to `## X.Y`.
  3. Add a fresh empty `## Next Version` section — no group headings until it has a bullet.
  4. CI requires the matching `## X.Y` section before it can create the first official `vX.Y`
     release.
- No `**WIP**` bullet may remain in the section being released: finish the work or move the bullet
  to the new `## Next Version`.
- A base supports at most 65,535 CI runs; bump `versionBuildOffset` before that limit.

---

## 13. Skills Index

Seven cross-agent skills live under `.agents/skills/`. Each skill links back to this file and adds
workflow detail without copying its rule bodies.

| Skill                  | Path                                             | Purpose                                                     |
| ---------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Extension Architecture | `.agents/skills/extension-architecture/SKILL.md` | MV3 patterns, SOLID mapping, composition root rules         |
| Testing Standards      | `.agents/skills/testing-standards/SKILL.md`      | Coverage thresholds, fake-injection patterns, Vitest config |
| Code Style             | `.agents/skills/code-style/SKILL.md`             | Naming, readability, documentation, DRY                     |
| Changelog & Versioning | `.agents/skills/changelog-versioning/SKILL.md`   | Version scheme, ChangeLog format, worker bullet protocol    |
| Add an Enhanced View   | `.agents/skills/add-enhanced-view/SKILL.md`      | Recipe + boilerplate for adding a new query view            |
| Add an Ordering Policy | `.agents/skills/add-ordering-policy/SKILL.md`    | Recipe for a new sort order and for applying one in a view  |
| Batch Work Item Writes | `.agents/skills/batch-work-item-writes/SKILL.md` | One JSON Patch per user action; the rev guard and HTTP 412  |

---

## 14. `package.json` Command Reference

| Command                   | What it does                                               |
| ------------------------- | ---------------------------------------------------------- |
| `pnpm build`              | One-shot build to `dist/`                                  |
| `pnpm build:watch`        | Watch rebuild                                              |
| `pnpm typecheck`          | TypeScript type-check (no emit)                            |
| `pnpm lint`               | ESLint check                                               |
| `pnpm lint:fix`           | ESLint auto-fix                                            |
| `pnpm format`             | Prettier write                                             |
| `pnpm format:check`       | Prettier check                                             |
| `pnpm duplication`        | jscpd duplicate detection                                  |
| `pnpm test`               | Vitest run (src tests)                                     |
| `pnpm test:scripts`       | node:test for `scripts/*.test.mjs`                         |
| `pnpm test:watch`         | Vitest watch                                               |
| `pnpm test:coverage`      | Vitest with coverage                                       |
| `pnpm package`            | Build + create store ZIPs                                  |
| `pnpm validate:workflows` | Validate CI/CD YAML schemas                                |
| `pnpm verify`             | Fresh full gate: parallel static checks, then coverage     |
| `pnpm verify:reuse`       | Reuse an exact-content successful gate, or run a fresh one |

---

## 15. Worker Completion Contract

Every parallel worker response must use this exact format:

```markdown
### Files changed

- path/to/file1
- path/to/file2

### Local validation

<commands run and pass/fail results, or "No commands required — <reason>">

### Memory-bank delta

- Completed: <concise facts or None>
- Remaining: <concise pending work or None>
- Decisions: <notable decisions or None>

### Changelog bullet

<group: New Features | Bug Fixes>

<one bullet for ## Next Version, or "None — <reason why non-user-visible>">
```

Workers run **only their listed local checks**. Repository-wide `pnpm verify`, packaging, release,
authenticated browser behavior, and final memory updates belong to one final serial barrier after
the wave map is complete.
