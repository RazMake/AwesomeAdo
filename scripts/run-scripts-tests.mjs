import { spawnSync } from "node:child_process";

// Run the node:test suites under the same signals GitHub Actions injects. computeVersion — and
// any future automation — branches on GITHUB_ACTIONS/CI, so mirroring those flags in the local
// Definition-of-Done gate guarantees an environment-sensitive failure surfaces in `pnpm verify`
// (and the pre-push hook) before it can ever reach the cloud. Suites that must stay
// environment-independent reset these variables themselves.
const ciEnvironment = { ...process.env, GITHUB_ACTIONS: "true", CI: "true" };

const result = spawnSync(process.execPath, ["--test", "scripts/*.test.mjs"], {
  stdio: "inherit",
  env: ciEnvironment,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
