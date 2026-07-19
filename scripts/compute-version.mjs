import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createVersion } from "./version.mjs";

/**
 * Parse ChangeLog.md to determine if there is a release section for the given base version.
 * Implements the exact state machine from the spec.
 * @param {string} changelogText
 * @param {string} base
 * @returns {void} throws if no valid release section found
 */
function requireChangelogSection(changelogText, base) {
  const lines = changelogText.split(/\r?\n/);
  let inFence = false;
  let fenceChar = "";
  let fenceMinLen = 0;
  let matches = 0;
  let inTarget = false;
  let targetHasBullet = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Fence detection
    if (!inFence) {
      const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
      if (fenceMatch) {
        // Opening fence: record char and minimum length
        const fenceStr = fenceMatch[1] ?? "";
        fenceChar = fenceStr.charAt(0) || "`";
        fenceMinLen = fenceStr.length;
        inFence = true;
        continue;
      }
    } else {
      // Inside fence: check for closing delimiter (same char, same or longer length)
      const closingPattern = new RegExp(`^\\${fenceChar}{${fenceMinLen},}$`);
      if (closingPattern.test(trimmed)) {
        inFence = false;
      }
      continue;
    }

    // Outside fences: check for H2
    const h2Match = /^## ([^#].*)$/.exec(line);
    if (h2Match) {
      // Fail the previous target if it had no bullet
      if (inTarget && !targetHasBullet) {
        throw new Error(
          `ChangeLog.md section "## ${base}" has no release bullet. Add at least one "- " bullet before the next heading.`,
        );
      }
      // Set inTarget based on exact match with target heading
      const heading = h2Match[1]?.trim() ?? "";
      inTarget = `## ${heading}` === `## ${base}`;
      if (inTarget) {
        matches += 1;
        if (matches > 1) {
          throw new Error(
            `ChangeLog.md contains duplicate "## ${base}" sections. Remove the duplicate.`,
          );
        }
        targetHasBullet = false;
      }
      continue;
    }

    // While in target, check for bullet
    if (inTarget && /^- \S/.test(line)) {
      targetHasBullet = true;
    }
  }

  // End of file: fail open target without bullet
  if (inTarget && !targetHasBullet) {
    throw new Error(
      `ChangeLog.md section "## ${base}" has no release bullet. Add at least one "- " bullet.`,
    );
  }

  if (matches === 0) {
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
    if (typeof releaseSha !== "string" || !/^[0-9a-f]{40}$/.test(releaseSha)) {
      throw new Error("RELEASE_SHA must be a lowercase 40-hex string in GitHub Actions");
    }
  }

  // Check changelog before setting should_release_official
  requireChangelogSection(changelogText, base);

  // Check tag presence
  const tagResult = tagExists(base);
  if ("error" in tagResult) {
    throw new Error(tagResult.error);
  }

  const is_new_official = !tagResult.exists;
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
