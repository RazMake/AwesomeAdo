import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createVersion } from "./version.mjs";

/**
 * Advance fenced-code-block tracking for one line. Content inside fences is
 * ignored so a sample like "## X.Y" in a code block never counts as a heading.
 * @param {{ inFence: boolean, fenceChar: string, fenceMinLen: number }} fence
 * @param {string} trimmed
 * @returns {boolean} true when the line was consumed by fence handling
 */
function trackFence(fence, trimmed) {
  if (fence.inFence) {
    const closingPattern = new RegExp(`^\\${fence.fenceChar}{${fence.fenceMinLen},}$`);
    if (closingPattern.test(trimmed)) {
      fence.inFence = false;
    }
    return true;
  }
  const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
  if (fenceMatch) {
    const fenceStr = fenceMatch[1] ?? "";
    fence.fenceChar = fenceStr.charAt(0) || "`";
    fence.fenceMinLen = fenceStr.length;
    fence.inFence = true;
    return true;
  }
  return false;
}

/**
 * Apply an H2 heading line to the section-tracking state, enforcing the
 * "previous target needed a bullet" and "no duplicate target" rules.
 * @param {{ inTarget: boolean, targetHasBullet: boolean, matches: number }} state
 * @param {string} line
 * @param {string} base
 * @returns {boolean} true when the line was an H2 heading
 */
function applyHeading(state, line, base) {
  const h2Match = /^## ([^#].*)$/.exec(line);
  if (!h2Match) {
    return false;
  }
  if (state.inTarget && !state.targetHasBullet) {
    throw new Error(
      `ChangeLog.md section "## ${base}" has no release bullet. Add at least one "- " bullet before the next heading.`,
    );
  }
  const heading = h2Match[1]?.trim() ?? "";
  state.inTarget = `## ${heading}` === `## ${base}`;
  if (state.inTarget) {
    state.matches += 1;
    if (state.matches > 1) {
      throw new Error(
        `ChangeLog.md contains duplicate "## ${base}" sections. Remove the duplicate.`,
      );
    }
    state.targetHasBullet = false;
  }
  return true;
}

/**
 * Parse ChangeLog.md to determine if there is a release section for the given base version.
 * Implements the exact state machine from the spec.
 * @param {string} changelogText
 * @param {string} base
 * @returns {void} throws if no valid release section found
 */
function requireChangelogSection(changelogText, base) {
  const fence = { inFence: false, fenceChar: "", fenceMinLen: 0 };
  const state = { inTarget: false, targetHasBullet: false, matches: 0 };

  for (const line of changelogText.split(/\r?\n/)) {
    if (trackFence(fence, line.trim())) {
      continue;
    }
    if (applyHeading(state, line, base)) {
      continue;
    }
    if (state.inTarget && /^- \S/.test(line)) {
      state.targetHasBullet = true;
    }
  }

  // End of file: fail open target without bullet
  if (state.inTarget && !state.targetHasBullet) {
    throw new Error(
      `ChangeLog.md section "## ${base}" has no release bullet. Add at least one "- " bullet.`,
    );
  }

  if (state.matches === 0) {
    throw new Error(
      `ChangeLog.md is missing a "## ${base}" section. Add one with at least one "- " bullet before releasing.`,
    );
  }
}

/**
 * Check if the base version tag exists in git.
 * @param {string} base
 * @returns {{ exists: boolean } | { error: string }}
 */
function checkTagExists(base) {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/tags/v${base}`]);
  if (result.error) {
    return { error: `Git process error: ${result.error.message}` };
  }
  if (result.status === 0) {
    return { exists: true };
  }
  if (result.status === 1) {
    return { exists: false };
  }
  return { error: `Git exited with unexpected status ${result.status}` };
}

/**
 * Require a lowercase 40-hex RELEASE_SHA when running under GitHub Actions.
 * @param {unknown} releaseSha
 */
function requireGithubActionsSha(releaseSha) {
  if (typeof releaseSha !== "string" || !/^[0-9a-f]{40}$/.test(releaseSha)) {
    throw new Error("RELEASE_SHA must be a lowercase 40-hex string in GitHub Actions");
  }
}

/**
 * Resolve whether the base tag is a new official release, surfacing git errors.
 * @param {(base: string) => { exists: boolean } | { error: string }} tagExists
 * @param {string} base
 * @returns {boolean}
 */
function resolveNewOfficial(tagExists, base) {
  const tagResult = tagExists(base);
  if ("error" in tagResult) {
    throw new Error(tagResult.error);
  }
  return !tagResult.exists;
}

/**
 * Compute the release version from the current environment.
 * @param {{
 *   packageMetadata?: unknown,
 *   changelogText?: string,
 *   releaseSha?: string | undefined,
 *   tagExists?: (base: string) => { exists: boolean } | { error: string },
 *   isGithubActions?: boolean,
 * }} [options]
 * @returns {{ base: string, build: string, full: string, is_new_official: boolean, should_release_official: boolean }}
 */
export function computeVersion(options = {}) {
  const {
    packageMetadata = JSON.parse(readFileSync("package.json", "utf8")),
    changelogText = readFileSync("ChangeLog.md", "utf8"),
    releaseSha = process.env.RELEASE_SHA,
    tagExists = checkTagExists,
    isGithubActions = process.env.GITHUB_ACTIONS === "true",
  } = options;

  const { base, build, full } = createVersion(packageMetadata, process.env.BUILD_NUMBER);

  // In GitHub Actions, RELEASE_SHA must be lowercase 40-hex
  if (isGithubActions) {
    requireGithubActionsSha(releaseSha);
  }

  // Check changelog before setting should_release_official
  requireChangelogSection(changelogText, base);

  const is_new_official = resolveNewOfficial(tagExists, base);
  const should_release_official = true;

  return { base, build, full, is_new_official, should_release_official };
}

/**
 * Emit the computed version as key=value lines.
 * @param {{ base: string, build: string, full: string, is_new_official: boolean, should_release_official: boolean }} result
 */
function emitResult(result) {
  const lines = [
    `base=${result.base}`,
    `build=${result.build}`,
    `full=${result.full}`,
    `is_new_official=${result.is_new_official}`,
    `should_release_official=${result.should_release_official}`,
  ];
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, lines.join("\n") + "\n", "utf8");
  } else {
    for (const line of lines) {
      process.stdout.write(line + "\n");
    }
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  try {
    const result = computeVersion();
    emitResult(result);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
