# Tech Context

## Technology Stack

| Topic                | Decision                                                                                |
| -------------------- | --------------------------------------------------------------------------------------- |
| Target browsers      | Chrome + Edge (both Chromium, Manifest V3)                                              |
| Language             | TypeScript (strict)                                                                     |
| TypeScript version   | 5.9 (not 7 — typescript-eslint@8.63.0 does not support TypeScript 7)                    |
| Runtime              | Node 24                                                                                 |
| Package manager      | pnpm 10.34.5                                                                            |
| Bundler              | esbuild via `scripts/build.mjs`                                                         |
| Test runner          | Vitest + `@vitest/coverage-v8` + jsdom                                                  |
| Lint / format        | ESLint 10 (flat config) + Prettier + jscpd                                              |
| ESLint import plugin | `eslint-plugin-import-x` (maintained replacement; original incompatible with ESLint 10) |
| Git hooks            | husky + lint-staged                                                                     |
| CI/CD                | GitHub Actions (repo: `github.com/RazMake/AwesomeAdo`)                                  |
| Store publishing     | `chrome-webstore-upload-cli` v4 + Edge Add-ons API v1.1, gated on complete secret sets  |

## Environment (Windows / PowerShell)

**Node is NOT on PATH by default.** Prepend before running node/pnpm:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"
```

**Git is NOT on PATH by default.** Prepend when needed:

```powershell
$env:Path = "C:\Program Files\Git\cmd;$env:Path"
```

**npm registry:** Microsoft feed proxy at `https://packagefeedproxy.microsoft.io/npm/`
Installs succeed even though `npm ping` may 404. Do not switch registries.

**Do NOT use corepack for pnpm.** Use the npm-installed pnpm directly:

```powershell
npm install --global pnpm@10.34.5
```

**Chrome for Testing** must be installed for authenticated in-browser validation. Official branded
Chrome 137+ no longer honors `--load-extension`; Chrome for Testing does. Edge remains the
branded-browser validation target.

**Prefer single-line PowerShell commands joined with `;`** — multi-line here-strings get garbled
in this shell environment.

## Version Scheme

- Developer owns **Major.Minor** and `versionBuildOffset`.
- CI computes `Build = github.run_number - versionBuildOffset`.
- Full version string: `Major.Minor.Build`.
- Initial version base: `0.1`.
