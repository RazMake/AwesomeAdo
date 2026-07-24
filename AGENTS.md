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

### Read the memory bank first

Before starting **any** task, read all files under `.agents/memory-bank/`:

```
.agents/memory-bank/README.md         — protocol
.agents/memory-bank/projectbrief.md   — north star + scope
.agents/memory-bank/productContext.md — problem + UX
.agents/memory-bank/techContext.md    — stack + environment
.agents/memory-bank/systemPatterns.md — architecture + SOLID mapping
.agents/memory-bank/activeContext.md  — current wave status
.agents/memory-bank/progress.md       — checklist
.agents/memory-bank/decisions.md      — ADRs
```

### Worker contract (§4.1)

Every parallel worker response must contain exactly these four headings in order:

1. **Files changed** — only files assigned to that stream.
2. **Local validation** — commands run and pass/fail results.
3. **Memory-bank delta** — completed work, remaining work, and decisions; `None` is valid.
4. **Changelog bullet** — one proposed bullet or `None` for non-user-visible work.

Use this exact shape for the third heading:

```markdown
## Memory-bank delta

- Completed: <concise facts or None>
- Remaining: <concise pending work or None>
- Decisions: <notable decisions or None>
```

Worker acceptance criteria are intentionally local. Repository-wide `pnpm verify`, packaging,
release, authenticated browser behavior, and final memory updates belong to serial barriers.

---

## 3. Memory Bank / Coordinator Protocol

- **Read** `.agents/memory-bank/` at the start of every task.
- **Parallel workers never edit** `activeContext.md`, `progress.md`, or `decisions.md` directly.
  Return a `Memory-bank delta` in the §4.1 response instead.
- **The serial coordinator** applies those deltas at each wave barrier, then runs `pnpm verify`.
- Wave 0A is the only bootstrap exception: it creates the memory bank before later agents can read
  it.
- The memory bank is for **internal architecture and rationale**. Component `README.md` files
  (under `src/common/**`) are for **usage documentation** only — describe the public API and
  intent, not internal implementation.

---

## 4. Definition-of-Done Gate

> **No change is complete until `pnpm verify` passes.**

`pnpm verify` runs the following checks in order:

1. `format:check` — Prettier format check
2. `lint` — ESLint check
3. `typecheck` — TypeScript type-check (no emit)
4. `duplication` — jscpd duplicate detection
5. `test:scripts` — node:test for `scripts/*.test.mjs`
6. `test:coverage` — Vitest with coverage (must reach ≥ 85% thresholds)
7. `validate:workflows` — validate CI/CD YAML schemas

This gate is enforced locally by the `pre-push` git hook and remotely by CI on every push.

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

## 9. Testing Rules

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

## 10. Folder & README Conventions

- `./` is the existing workspace root — **never** create a nested project directory.
- Every component subfolder under `src/**` (each subfolder of `common/`, `content/`, and
  `options/`) **must** have a `README.md` describing how to use it (public API + intent). Internal
  architecture belongs in the memory bank.
- Entry files named `index.ts` contain **only composition/wiring** and are excluded from coverage.
- `scripts/**` contains build and release automation only; it is never bundled into the extension.
- `store-assets/` contains marketplace listing files provided by the developer.

---

## 11. Versioning & Changelog Rules

- The **developer** owns `Major.Minor` and `versionBuildOffset`.
- **CI** computes `Build = github.run_number - versionBuildOffset`. Full version: `Major.Minor.Build`.
- Initial version base: `0.1`.
- Every logical change proposes a bullet for `## Next Version` in `ChangeLog.md`. Parallel workers
  return the bullet in their §4.1 response; the serial coordinator consolidates and writes bullets
  at wave barriers.
- When the developer bumps Major or Minor:
  1. Set `versionBuildOffset` to the latest CI workflow run number visible before the bump.
  2. Rename `## Next Version` to `## X.Y`.
  3. Add a fresh empty `## Next Version` section.
  4. CI requires the matching `## X.Y` section before it can create the first official `vX.Y`
     release.
- A base supports at most 65,535 CI runs; bump `versionBuildOffset` before that limit.

---

## 12. Skills Index

Four cross-agent skills live under `.agents/skills/`. Each skill links back to this file and adds
workflow detail without copying its rule bodies.

| Skill                  | Path                                             | Purpose                                                     |
| ---------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Extension Architecture | `.agents/skills/extension-architecture/SKILL.md` | MV3 patterns, SOLID mapping, composition root rules         |
| Testing Standards      | `.agents/skills/testing-standards/SKILL.md`      | Coverage thresholds, fake-injection patterns, Vitest config |
| Code Style             | `.agents/skills/code-style/SKILL.md`             | Naming, readability, documentation, DRY                     |
| Changelog & Versioning | `.agents/skills/changelog-versioning/SKILL.md`   | Version scheme, ChangeLog format, worker bullet protocol    |

---

## 13. `package.json` Command Reference

| Command                   | What it does                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`              | One-shot build to `dist/`                                                                                             |
| `pnpm build:watch`        | Watch rebuild                                                                                                         |
| `pnpm typecheck`          | TypeScript type-check (no emit)                                                                                       |
| `pnpm lint`               | ESLint check                                                                                                          |
| `pnpm lint:fix`           | ESLint auto-fix                                                                                                       |
| `pnpm format`             | Prettier write                                                                                                        |
| `pnpm format:check`       | Prettier check                                                                                                        |
| `pnpm duplication`        | jscpd duplicate detection                                                                                             |
| `pnpm test`               | Vitest run (src tests)                                                                                                |
| `pnpm test:scripts`       | node:test for `scripts/*.test.mjs`                                                                                    |
| `pnpm test:watch`         | Vitest watch                                                                                                          |
| `pnpm test:coverage`      | Vitest with coverage                                                                                                  |
| `pnpm package`            | Build + create store ZIPs                                                                                             |
| `pnpm validate:workflows` | Validate CI/CD YAML schemas                                                                                           |
| `pnpm verify`             | Full quality gate (format:check → lint → typecheck → duplication → test:scripts → test:coverage → validate:workflows) |

---

## 14. Worker Completion Contract

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

<one bullet for ## Next Version, or "None — <reason why non-user-visible>">
```

Workers run **only their listed local checks**. Repository-wide `pnpm verify`, packaging, release,
authenticated browser behavior, and final memory updates belong to the serial barriers named in the
wave map.
