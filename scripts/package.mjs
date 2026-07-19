import { execFileSync } from "node:child_process";
import { createWriteStream, lstatSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { finished as finishedCb } from "node:stream";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { ZipArchive } from "archiver";

import { listFiles } from "./fs-utils.mjs";
import { createVersion } from "./version.mjs";

const finished = promisify(finishedCb);

// Earliest portable DOS ZIP timestamp — ensures deterministic archives across runs.
const ZIP_DATE = new Date("1980-01-01T00:00:00.000Z");

const REQUIRED_DIST_FILES = [
  "manifest.json",
  "background/service-worker.js",
  "content/blank-query-page.js",
  "options/options.js",
  "options/options.html",
];

const SHA_PATTERN = /^[0-9a-f]{40}$/;

/**
 * @param {string} destination
 * @param {Array<{ absolutePath: string, name: string }>} entries
 */
async function writeArchive(destination, entries) {
  const output = createWriteStream(destination, { flags: "wx" });
  const outputDone = finished(output);
  // statConcurrency: 1 serialises the lstat queue so entries are appended in
  // the exact order file() is called — required for byte-identical archives.
  const archive = new ZipArchive({ zlib: { level: 9 }, statConcurrency: 1 });
  archive.on("warning", (error) => output.destroy(error));
  archive.on("error", (error) => output.destroy(error));
  archive.pipe(output);
  for (const entry of entries) {
    archive.file(entry.absolutePath, {
      name: entry.name,
      date: ZIP_DATE,
      mode: 0o100644,
    });
  }
  await archive.finalize();
  await outputDone;
}

/**
 * Walk a directory recursively and collect file entries.
 * @param {string} dir - absolute path to walk
 * @param {string} base - base directory for relative path computation
 * @returns {Array<{ absolutePath: string, name: string }>}
 */
function walkDir(dir, base) {
  // Posix-format path invariants are enforced because archive entry names must be portable.
  return listFiles(dir, base, "dist/").map(({ absolutePath, relativePath }) => {
    if (relativePath.includes("\\")) {
      throw new Error(`Archive entry name contains backslash: ${relativePath}`);
    }
    if (path.isAbsolute(relativePath)) {
      throw new Error(`Archive entry name is absolute: ${relativePath}`);
    }
    const segments = relativePath.split("/");
    if (segments.includes(".") || segments.includes("..")) {
      throw new Error(`Archive entry has . or .. segment: ${relativePath}`);
    }
    if (relativePath.endsWith(".map")) {
      throw new Error(`Source map file found in dist/: ${relativePath}`);
    }
    return { absolutePath, name: relativePath };
  });
}

/**
 * Package the extension into store ZIP archives.
 * @param {{
 *   packageMetadata?: unknown,
 *   env?: NodeJS.ProcessEnv,
 *   runBuild?: (env: NodeJS.ProcessEnv) => void,
 *   artifactsDir?: string,
 *   distDir?: string,
 * }} [options]
 */
export async function packageExtension(options = {}) {
  const {
    packageMetadata = JSON.parse(await readFile("package.json", "utf8")),
    env = process.env,
    runBuild = (buildEnv) => {
      execFileSync(process.execPath, ["scripts/build.mjs"], {
        env: buildEnv,
        stdio: "inherit",
      });
    },
    artifactsDir = "artifacts",
    distDir = "dist",
  } = options;

  // Require GITHUB_SHA before any mutation
  const githubSha = env.GITHUB_SHA;
  if (typeof githubSha !== "string" || !SHA_PATTERN.test(githubSha)) {
    throw new Error("GITHUB_SHA must be a lowercase 40-hex string before packaging");
  }

  const { base, build, full } = createVersion(packageMetadata, env.BUILD_NUMBER);

  // Run store build with STORE_BUILD=1 in a copied env (never mutate process.env)
  const buildEnv = { ...env, STORE_BUILD: "1" };
  runBuild(buildEnv);

  // Validate required dist files exist and are regular files (not symlinks)
  for (const required of REQUIRED_DIST_FILES) {
    const filePath = path.join(distDir, required);
    let stat;
    try {
      stat = lstatSync(filePath);
    } catch {
      throw new Error(`Required dist file is missing: ${required}`);
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Required dist file is not a regular file: ${required}`);
    }
  }

  // Parse the built manifest and require version === full
  const manifestPath = path.join(distDir, "manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    throw new Error(
      `Cannot parse built manifest.json: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (manifest.version !== full) {
    throw new Error(
      `Built manifest version '${manifest.version}' does not match expected '${full}'`,
    );
  }

  // Walk dist/ and collect sorted entries
  const entries = walkDir(path.resolve(distDir), path.resolve(distDir));
  if (entries.length === 0) {
    throw new Error("dist/ contains no files to archive");
  }

  // Check for duplicate normalized names
  const nameSet = new Set();
  for (const entry of entries) {
    if (nameSet.has(entry.name)) {
      throw new Error(`Duplicate normalized archive entry: ${entry.name}`);
    }
    nameSet.add(entry.name);
  }

  // Sort by Unicode code-point order
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // Recreate artifacts/ directory
  await rm(artifactsDir, { recursive: true, force: true });
  await mkdir(artifactsDir, { recursive: true });

  const chromeName = `awesomeado-chrome-${full}.zip`;
  const edgeName = `awesomeado-edge-${full}.zip`;
  const chromeArchive = path.join(artifactsDir, chromeName);
  const edgeArchive = path.join(artifactsDir, edgeName);

  try {
    // Create archives sequentially for deterministic error attribution
    await writeArchive(chromeArchive, entries);
    await writeArchive(edgeArchive, entries);
  } catch (error) {
    // Remove partially recreated artifacts/ on any failure
    await rm(artifactsDir, { recursive: true, force: true });
    throw error;
  }

  // Write metadata only after both archives close successfully
  const metadata = {
    format: 1,
    base,
    build,
    full,
    GITHUB_SHA: githubSha,
  };
  const metadataPath = path.join(artifactsDir, "release-metadata.json");
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + "\n", "utf8");
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  packageExtension().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
