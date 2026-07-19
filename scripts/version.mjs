export const MAX_VERSION_PART = 65_535;

/**
 * @typedef {object} PackageMetadata
 * @property {string} version
 * @property {number} [versionBuildOffset]
 */

/**
 * @param {PackageMetadata} packageMetadata
 * @param {string | number | undefined} [rawCiBuildNumber]
 * @returns {{ base: string, build: string, full: string }}
 */
export function createVersion(packageMetadata, rawCiBuildNumber) {
  const match = /^(\d+)\.(\d+)\.\d+$/.exec(packageMetadata.version);
  if (!match) {
    throw new Error(`package.json version must be Major.Minor.Patch: ${packageMetadata.version}`);
  }

  const rawMajor = match[1];
  const rawMinor = match[2];
  if (rawMajor === undefined || rawMinor === undefined) {
    throw new Error(`package.json version is incomplete: ${packageMetadata.version}`);
  }
  const major = parsePart(rawMajor, "major");
  const minor = parsePart(rawMinor, "minor");
  const offset = parseCounter(packageMetadata.versionBuildOffset ?? 0, "versionBuildOffset");
  const ciBuild = parseCounter(rawCiBuildNumber ?? offset, "CI build number");
  const build = ciBuild - offset;
  if (build < 0 || build > MAX_VERSION_PART) {
    throw new Error(`effective build must be between 0 and ${MAX_VERSION_PART}: ${build}`);
  }
  const base = `${major}.${minor}`;
  return { base, build: String(build), full: `${base}.${build}` };
}

/** @param {string} raw @param {string} name */
function parsePart(raw, name) {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} version part must be an integer: ${raw}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > MAX_VERSION_PART) {
    throw new Error(`${name} version part must be between 0 and ${MAX_VERSION_PART}: ${raw}`);
  }
  return value;
}

/** @param {unknown} raw @param {string} name */
function parseCounter(raw, name) {
  if (!/^\d+$/.test(String(raw))) {
    throw new Error(`${name} must be a non-negative integer: ${raw}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer: ${raw}`);
  }
  return value;
}
