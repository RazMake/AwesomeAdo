# Decisions

## ADR-001: Target browsers

- Decision: Chrome + Edge (both Chromium MV3)
- Rationale: Single build serves both stores

## ADR-002: Language

- Decision: TypeScript (strict)
- Rationale: Type safety requirement

## ADR-003: Runtime

- Decision: Node 24
- Rationale: Matches verified local runtime and current GitHub Actions runtimes

## ADR-004: Package manager

- Decision: pnpm 10.34.5
- Rationale: Current stable pnpm release compatible with Node 24

## ADR-005: Bundler

- Decision: esbuild via scripts/build.mjs
- Rationale: Barebone, transparent, no framework magic

## ADR-006: Test runner

- Decision: Vitest + @vitest/coverage-v8 + jsdom
- Rationale: First-class TypeScript + coverage thresholds that fail the build

## ADR-007: Lint/format

- Decision: ESLint 10 (flat config) + Prettier + jscpd
- Rationale: Enforces style and the "no duplicated code" rule

## ADR-008: Git hooks

- Decision: husky + lint-staged
- Rationale: Enforces "not done until verify passes" locally

## ADR-009: CI/CD

- Decision: GitHub Actions (repo: github.com/RazMake/AwesomeAdo)
- Rationale: Matches the remote; store secrets in protected GitHub environment

## ADR-010: Store publishing

- Decision: chrome-webstore-upload-cli v4 + Edge Add-ons API v1.1, gated on complete secret sets
- Rationale: Automated official releases with guarded manual replay

## ADR-011: Version scheme

- Decision: Major.Minor owned by developer; Build = CI run_number - versionBuildOffset
- Rationale: Developer controls breaking changes; CI automates patch increments

## ADR-012: ESLint plugin

- Decision: eslint-plugin-import-x (maintained replacement for eslint-plugin-import)
- Rationale: Allows ESLint 10; original plugin not compatible with ESLint 10

## ADR-013: TypeScript version

- Decision: TypeScript 5.9 (not 7)
- Rationale: typescript-eslint@8.63.0 does not support TypeScript 7

## ADR-014: validate-workflows.mjs helper extraction

- Decision: Extracted `getJobSteps()` helper to eliminate duplicated null-guard + steps access pattern across `getStepIds`, `getStepRuns`, `getStepUses`
- Rationale: jscpd threshold is 0% — even small duplications block the gate

## ADR-015: GitHub workflow schema pin

- Decision: Pinned SchemaStore schema at commit 7c910423, SHA-256 7a952fdb...
- Rationale: Immutable commit pin ensures deterministic validation; hash verified on download

## ADR-016: ESLint preserve-caught-error rule

- Decision: All catch-and-rethrow patterns must include `{ cause: error }` in the new Error constructor
- Rationale: ESLint's `preserve-caught-error` rule is enforced; preserves error chain for debugging

## ADR-017: Shared synced-storage observation helper

- Decision: The race-sensitive "subscribe before reading, revision-guard the initial read" protocol
  lives once in `observeSyncKeys` (`src/common/browser`); both `BrowserSyncSettingsStore` and
  `BrowserSyncQueryBindingStore` delegate to it.
- Rationale: The two stores previously reimplemented the same protocol and had begun to drift. One
  tested implementation removes the drift and gives the logic a single test surface.

## ADR-018: Single source of truth for ADO host matching

- Decision: `AdoHost` (`src/common/navigation`) owns `isSupportedAdoHost`, the `.visualstudio.com`
  suffix, and `ADO_HOST_MATCH_PATTERNS`. The route parser, identity parser, and both tab readers
  derive from it; the manifest globs are pinned to it by `AdoHost.test.ts`.
- Rationale: The "which URLs are ADO" fact was encoded in four independent places (two predicates
  plus the reader globs plus the manifest) that could silently diverge on the security-relevant
  anchored suffix check. The anchored suffix (rejecting `fake.visualstudio.com.evil.com`) must be
  preserved.

## ADR-019: The store owns bindings-map read-modify-write

- Decision: All mutation of the bindings map (`bind`, `unbind`, `setActiveView`) lives in
  `BrowserSyncQueryBindingStore`. Callers forward intent; they never read-modify-write the map
  themselves.
- Rationale: The content script previously re-derived the read-modify-write to toggle a query's
  active view. Centralizing it keeps every mutation in one place and out of the coverage-excluded
  wiring file.

## ADR-020: Host-wide injection with route-gated heavy work

- Decision: The content script is injected on all hosted ADO pages (required to catch SPA navigation
  into Query routes), but every heavy action is gated behind a parsed query id. The only always-on
  cost on a non-query page is two synced-storage observers and one runtime message listener.
- Rationale: Balances the "minimal impact on non-query pages" goal against the MV3 reality that a
  content script cannot be re-injected on in-page SPA navigation. Lazy subscription was considered
  and rejected as higher-risk churn to the correct navigation/blanking flow for negligible savings.
