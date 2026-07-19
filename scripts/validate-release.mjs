import { appendFileSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import AdmZip from "adm-zip";

const MIB = 1024 * 1024;
const MAX_ARCHIVE_BYTES = 50 * MIB;
const MAX_ENTRIES = 256;
const MAX_ENTRY_BYTES = 10 * MIB;
const MAX_TOTAL_BYTES = 50 * MIB;
const MAX_MANIFEST_BYTES = MIB;
const MAX_METADATA_BYTES = MIB;
const REQUIRED_ARCHIVE_FILES = [
  "manifest.json",
  "background/service-worker.js",
  "content/blank-query-page.js",
  "options/options.js",
  "options/options.html",
];
const METADATA_KEYS = ["GITHUB_SHA", "base", "build", "format", "full"];
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const BASE_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BUILD_PATTERN = /^(0|[1-9]\d*)$/;

/**
 * @typedef {object} ValidateReleaseOptions
 * @property {string} artifactDirectory
 * @property {string} expectedSha
 * @property {string} [expectedFull]
 * @property {string} [officialTag]
 * @property {string} [officialTagSha]
 */

/**
 * @typedef {object} ReleaseMetadata
 * @property {1} format
 * @property {string} base
 * @property {string} build
 * @property {string} full
 * @property {string} GITHUB_SHA
 */

/**
 * @typedef {object} ValidationResult
 * @property {string} base
 * @property {string} full
 * @property {string} source_sha
 * @property {string} chrome_archive
 * @property {string} edge_archive
 */

/** @typedef {import("adm-zip").IZipEntry} ZipEntry */

/** @param {ValidateReleaseOptions} options @returns {ValidationResult} */
export function validateRelease({
  artifactDirectory,
  expectedSha,
  expectedFull,
  officialTag,
  officialTagSha,
}) {
  requireSha(expectedSha, "expected SHA");
  if ((officialTag === undefined) !== (officialTagSha === undefined)) {
    throw new Error("official tag and official tag SHA must be supplied together");
  }

  const directory = path.resolve(artifactDirectory);
  requireDirectory(directory);
  const metadataPath = path.join(directory, "release-metadata.json");
  requireRegularFile(metadataPath, "release metadata");
  const metadataSize = statSync(metadataPath).size;
  if (
    !Number.isSafeInteger(metadataSize) ||
    metadataSize <= 0 ||
    metadataSize > MAX_METADATA_BYTES
  ) {
    throw new Error("release metadata size is invalid");
  }
  const metadata = parseMetadata(readFileSync(metadataPath, "utf8"));

  if (metadata.GITHUB_SHA !== expectedSha) {
    throw new Error("release metadata SHA does not match expected SHA");
  }
  if (expectedFull !== undefined && metadata.full !== expectedFull) {
    throw new Error("release metadata version does not match expected version");
  }
  if (officialTag !== undefined) {
    requireSha(officialTagSha, "official tag SHA");
    if (officialTag !== `v${metadata.base}` || officialTagSha !== expectedSha) {
      throw new Error("official tag is not bound to the validated release SHA");
    }
  }

  const chromeName = `awesomeado-chrome-${metadata.full}.zip`;
  const edgeName = `awesomeado-edge-${metadata.full}.zip`;
  requireExactArtifacts(directory, ["release-metadata.json", chromeName, edgeName]);

  const chromeArchive = path.join(directory, chromeName);
  const edgeArchive = path.join(directory, edgeName);
  validateArchive(chromeArchive, metadata.full);
  validateArchive(edgeArchive, metadata.full);

  return {
    base: metadata.base,
    full: metadata.full,
    source_sha: metadata.GITHUB_SHA,
    chrome_archive: chromeArchive,
    edge_archive: edgeArchive,
  };
}

/** @param {string} text @returns {ReleaseMetadata} */
function parseMetadata(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`release metadata is not valid JSON: ${errorMessage(error)}`, { cause: error });
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("release metadata must be an object");
  }
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify(METADATA_KEYS)) {
    throw new Error(`release metadata fields must be: ${METADATA_KEYS.join(", ")}`);
  }
  if (value.format !== 1) {
    throw new Error("unsupported release metadata format");
  }
  if (
    typeof value.base !== "string" ||
    typeof value.build !== "string" ||
    typeof value.full !== "string"
  ) {
    throw new Error("release metadata version fields must be strings");
  }
  const baseMatch = BASE_PATTERN.exec(value.base);
  if (!baseMatch || !BUILD_PATTERN.test(value.build)) {
    throw new Error("release metadata version fields are malformed");
  }
  const parts = [...baseMatch.slice(1), value.build].map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part) || part > 65_535)) {
    throw new Error("release metadata version component is out of range");
  }
  if (value.full !== `${value.base}.${value.build}`) {
    throw new Error("release metadata full version is inconsistent");
  }
  requireSha(value.GITHUB_SHA, "release metadata GITHUB_SHA");
  return value;
}

/** @param {string} archivePath @param {string} expectedVersion */
function validateArchive(archivePath, expectedVersion) {
  requireRegularFile(archivePath, "release archive");
  const archiveSize = statSync(archivePath).size;
  if (!Number.isSafeInteger(archiveSize) || archiveSize <= 0 || archiveSize > MAX_ARCHIVE_BYTES) {
    throw new Error(`release archive size is invalid: ${archivePath}`);
  }

  /** @type {ZipEntry[]} */
  let entries;
  try {
    entries = new AdmZip(archivePath).getEntries();
  } catch (error) {
    throw new Error(`cannot read release archive ${archivePath}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
  if (entries.length === 0 || entries.length > MAX_ENTRIES) {
    throw new Error(`release archive entry count is invalid: ${archivePath}`);
  }

  const entryMap = indexEntries(entries, archivePath);
  let decodedTotal = 0;
  /** @type {unknown} */
  let manifest;
  for (const [entryName, entry] of entryMap) {
    if (entry.isDirectory) {
      continue;
    }
    let data;
    try {
      data = entry.getData();
    } catch (error) {
      throw new Error(`cannot decode ${entryName} in ${archivePath}: ${errorMessage(error)}`, {
        cause: error,
      });
    }
    if (!Buffer.isBuffer(data) || data.length !== entry.header.size) {
      throw new Error(`decoded size mismatch for ${entryName} in ${archivePath}`);
    }
    if (decodedTotal > MAX_TOTAL_BYTES - data.length) {
      throw new Error(`decoded archive content exceeds ${MAX_TOTAL_BYTES} bytes: ${archivePath}`);
    }
    decodedTotal += data.length;
    if (entryName === "manifest.json") {
      if (data.length > MAX_MANIFEST_BYTES) {
        throw new Error("archived manifest exceeds its size limit");
      }
      try {
        manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
      } catch (error) {
        throw new Error(`archived manifest is invalid: ${errorMessage(error)}`, { cause: error });
      }
    }
  }

  for (const requiredName of REQUIRED_ARCHIVE_FILES) {
    const entry = entryMap.get(requiredName);
    if (!entry || entry.isDirectory) {
      throw new Error(`release archive is missing ${requiredName}: ${archivePath}`);
    }
  }
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("version" in manifest) ||
    manifest.version !== expectedVersion
  ) {
    throw new Error(`archived manifest version is invalid: ${archivePath}`);
  }
}

/**
 * @param {ZipEntry[]} entries
 * @param {string} archivePath
 * @returns {Map<string, ZipEntry>}
 */
function indexEntries(entries, archivePath) {
  const entryMap = new Map();
  let declaredTotal = 0;
  for (const entry of entries) {
    const rawName = entry.entryName;
    if (typeof rawName !== "string" || rawName.length === 0 || /[\0\\]/.test(rawName)) {
      throw new Error(`archive entry name is unsafe: ${archivePath}`);
    }
    if (path.posix.isAbsolute(rawName) || /^[A-Za-z]:/.test(rawName)) {
      throw new Error(`archive entry path is absolute: ${rawName}`);
    }
    const rawSegments = rawName.split("/");
    if (rawSegments.includes("..")) {
      throw new Error(`archive entry traverses its root: ${rawName}`);
    }
    const hasTrailingSlash = rawName.endsWith("/");
    if (entry.isDirectory ? !hasTrailingSlash || rawName.endsWith("//") : hasTrailingSlash) {
      throw new Error(`archive entry slash form is invalid: ${rawName}`);
    }
    const strippedName = entry.isDirectory ? rawName.slice(0, -1) : rawName;
    const canonicalName = path.posix.normalize(strippedName);
    if (canonicalName === "." || canonicalName !== strippedName || entryMap.has(canonicalName)) {
      throw new Error(`archive entry is duplicate or noncanonical: ${rawName}`);
    }

    const declaredSize = entry.header.size;
    const compressedSize = entry.header.compressedSize;
    validateEntrySizes(declaredSize, compressedSize, rawName);
    if (canonicalName === "manifest.json" && declaredSize > MAX_MANIFEST_BYTES) {
      throw new Error("archived manifest exceeds its declared size limit");
    }
    if (declaredTotal > MAX_TOTAL_BYTES - declaredSize) {
      throw new Error(`declared archive content exceeds ${MAX_TOTAL_BYTES} bytes: ${archivePath}`);
    }
    declaredTotal += declaredSize;
    if ((entry.header.flags & 0x1) !== 0) {
      throw new Error(`encrypted archive entry is forbidden: ${rawName}`);
    }
    if (entry.header.made >>> 8 === 3) {
      const mode = (entry.attr >>> 16) & 0xffff;
      if ((mode & 0o170000) === 0o120000) {
        throw new Error(`symbolic-link archive entry is forbidden: ${rawName}`);
      }
    }
    entryMap.set(canonicalName, entry);
  }
  return entryMap;
}

/**
 * @param {unknown} declaredSize
 * @param {unknown} compressedSize
 * @param {string} rawName
 */
export function validateEntrySizes(declaredSize, compressedSize, rawName) {
  if (
    !Number.isSafeInteger(declaredSize) ||
    /** @type {number} */ (declaredSize) < 0 ||
    /** @type {number} */ (declaredSize) > MAX_ENTRY_BYTES ||
    !Number.isSafeInteger(compressedSize) ||
    /** @type {number} */ (compressedSize) < 0 ||
    /** @type {number} */ (compressedSize) > MAX_ARCHIVE_BYTES
  ) {
    throw new Error(`archive entry size is invalid: ${rawName}`);
  }
}

/** @param {string} directory @param {string[]} expectedNames */
function requireExactArtifacts(directory, expectedNames) {
  const actualNames = readdirSync(directory).sort();
  const sortedExpected = [...expectedNames].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(sortedExpected)) {
    throw new Error(`artifact directory must contain exactly: ${sortedExpected.join(", ")}`);
  }
  for (const name of sortedExpected) {
    requireRegularFile(path.join(directory, name), `artifact ${name}`);
  }
}

/** @param {string} directory */
function requireDirectory(directory) {
  const info = lstatSync(directory);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`artifact directory is not a real directory: ${directory}`);
  }
}

/** @param {string} filePath @param {string} label */
function requireRegularFile(filePath, label) {
  const info = lstatSync(filePath);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`${label} is not a regular file: ${filePath}`);
  }
}

/** @param {unknown} value @param {string} label */
function requireSha(value, label) {
  if (typeof value !== "string" || !SHA_PATTERN.test(value)) {
    throw new Error(`${label} must be lowercase 40-hex`);
  }
}

/** @param {string[]} argumentsList @returns {ValidateReleaseOptions} */
function parseArguments(argumentsList) {
  const allowed = new Set([
    "--artifacts",
    "--expected-sha",
    "--expected-full",
    "--official-tag",
    "--official-tag-sha",
  ]);
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (
      flag === undefined ||
      !allowed.has(flag) ||
      value === undefined ||
      value.startsWith("--") ||
      values.has(flag)
    ) {
      throw new Error(`invalid release-validator argument: ${flag ?? "<missing>"}`);
    }
    values.set(flag, value);
  }
  const artifactDirectory = values.get("--artifacts");
  const expectedSha = values.get("--expected-sha");
  if (artifactDirectory === undefined || expectedSha === undefined) {
    throw new Error("--artifacts and --expected-sha are required");
  }
  return {
    artifactDirectory,
    expectedSha,
    expectedFull: values.get("--expected-full"),
    officialTag: values.get("--official-tag"),
    officialTagSha: values.get("--official-tag-sha"),
  };
}

/** @param {ValidationResult} result */
function emitResult(result) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const lines = Object.entries(result).map(([key, value]) => {
    if (/[\r\n]/.test(value)) {
      throw new Error(`release-validator output contains a newline: ${key}`);
    }
    return `${key}=${value}`;
  });
  appendFileSync(outputFile, `${lines.join("\n")}\n`, "utf8");
}

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  try {
    emitResult(validateRelease(parseArguments(process.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
