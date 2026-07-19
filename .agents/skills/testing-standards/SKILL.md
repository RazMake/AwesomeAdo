---
name: testing-standards
description: Procedural Vitest workflow and focused test commands for the AwesomeADO extension.
---

# Testing Standards Skill

Read [AGENTS.md](../../../AGENTS.md) before proceeding. Mandatory rules are in
**Testing rules** (AGENTS.md §3.5). This skill adds actionable workflow steps.

## Writing a test

1. Use **injected fakes**, not mocks of `chrome.*`, real timers, or network calls. See
   `ChromeSyncStorage.test.ts` for the `globalThis.chrome` assignment pattern and
   `BrowserSyncSettingsStore.test.ts` for a hand-written `FakeBrowserSyncStorage`.

2. Each test must be deterministic: the same test run twice produces the same result (see
   AGENTS.md **No flaky tests**).

3. Never use `skip`, `todo`, `only`, or `retry`. See AGENTS.md **A failing test is never
   acceptable**. Fix the code or the test.

4. `vitest.config.ts` enforces `retry: 0` — flakiness cannot be masked by re-runs.

## Running tests

Run only the test file you own during parallel work (do not run full coverage while sibling
workers are editing):

```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"
pnpm exec vitest run src/common/browser/ChromeSyncStorage.test.ts
```

Run coverage for the full src tree only at the serial wave barrier:

```powershell
pnpm test:coverage
```

Script tests (scripts/*.test.mjs) use node:test, not Vitest:

```powershell
pnpm test:scripts
# or for a single file:
node --test scripts/version.test.mjs
```

## Coverage thresholds

≥ 85% lines, functions, branches, statements across `src/**` (excluding composition roots and
declaration files). See AGENTS.md §3.5 and `vitest.config.ts` for the exact exclusion list.

## References

- Testing rules: AGENTS.md §3.5
- Definition of done: AGENTS.md §3.6
