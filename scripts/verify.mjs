import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STATIC_STAGES = [
  "format:check",
  "lint",
  "typecheck",
  "duplication",
  "test:scripts",
  "validate:workflows",
];
const COVERAGE_STAGE = "test:coverage";
const STAMP_NAME = "awesomeado-verify-stamp.json";

/** @param {{ path: string, content: Buffer | string }[]} entries @param {string} runtime */
export function createVerificationFingerprint(entries, runtime) {
  const hash = createHash("sha256");
  hash.update(`awesomeado-verify-v1\0${runtime}\0`);
  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(`${entry.path}\0`);
    hash.update(entry.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** @param {string | undefined} recorded @param {string | undefined} current */
export function canReuseVerification(recorded, current) {
  return recorded !== undefined && current !== undefined && recorded === current;
}

/** @param {string[]} stages @param {(stage: string) => Promise<number>} runStage */
export async function runStageWave(stages, runStage) {
  const results = await Promise.all(
    stages.map(async (stage) => ({ stage, exitCode: await runStage(stage) })),
  );
  return results.filter((result) => result.exitCode !== 0);
}

function repositoryPaths() {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      encoding: "utf8",
    },
  );
  if (result.status !== 0) return undefined;
  return result.stdout.split("\0").filter(Boolean);
}

function repositoryFingerprint() {
  const paths = repositoryPaths();
  if (!paths) return undefined;
  const entries = paths.map((filePath) => {
    try {
      return { path: filePath, content: readFileSync(filePath) };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { path: filePath, content: "<missing>" };
      }
      throw error;
    }
  });
  return createVerificationFingerprint(
    entries,
    `${process.version}\0${process.platform}\0${process.arch}\0${process.env.npm_config_user_agent ?? ""}`,
  );
}

function stampPath() {
  const result = spawnSync("git", ["rev-parse", "--git-path", STAMP_NAME], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  return path.resolve(result.stdout.trim());
}

/** @param {string | undefined} filePath */
function readRecordedFingerprint(filePath) {
  if (!filePath) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return typeof parsed.fingerprint === "string" ? parsed.fingerprint : undefined;
  } catch {
    return undefined;
  }
}

/** @param {string | undefined} filePath @param {string | undefined} fingerprint */
function recordFingerprint(filePath, fingerprint) {
  if (!filePath || !fingerprint) return;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    JSON.stringify({ fingerprint, verifiedAt: new Date().toISOString() }, null, 2) + "\n",
  );
}

/** @param {string} stage */
function runPnpmStage(stage) {
  process.stdout.write(`\n==> ${stage}\n`);
  const pnpmScript = process.env.npm_execpath;
  const command = pnpmScript
    ? process.execPath
    : process.platform === "win32"
      ? "pnpm.cmd"
      : "pnpm";
  const args = pnpmScript ? [pnpmScript, stage] : [stage];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

/** @param {{ stage: string, exitCode: number }[]} failures */
function reportFailures(failures) {
  if (failures.length === 0) return;
  const names = failures.map((failure) => failure.stage).join(", ");
  throw new Error(`Verification failed: ${names}`);
}

export async function verify({ reuse = false } = {}) {
  const initialFingerprint = repositoryFingerprint();
  const verificationStamp = stampPath();
  if (
    reuse &&
    canReuseVerification(readRecordedFingerprint(verificationStamp), initialFingerprint)
  ) {
    process.stdout.write("Verification already passed for these exact repository contents.\n");
    return;
  }

  reportFailures(await runStageWave(STATIC_STAGES, runPnpmStage));
  reportFailures(await runStageWave([COVERAGE_STAGE], runPnpmStage));

  const finalFingerprint = repositoryFingerprint();
  if (initialFingerprint !== finalFingerprint) {
    throw new Error("Repository contents changed while verification was running; run it again.");
  }
  recordFingerprint(verificationStamp, finalFingerprint);
  process.stdout.write("\nVerification passed.\n");
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  verify({ reuse: process.argv.includes("--reuse") }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
