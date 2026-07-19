import crypto from "node:crypto";
import { appendFileSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { listFiles } from "./fs-utils.mjs";

const GITHUB_API_VERSION = "2026-03-10";
const APPROVED_APP_SLUG = "awesomeado-release-publisher";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const BASE_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const FULL_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_BASENAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const MAX_ASSET_BYTES = 255;
const MAX_STORE_ASSETS = 100;

/**
 * @param {string} token
 * @returns {Record<string, string>}
 */
function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    Authorization: `Bearer ${token}`,
  };
}

/**
 * @param {typeof globalThis.fetch} fetchImpl
 * @param {string} url
 * @param {string} token
 * @returns {Promise<unknown>}
 */
async function githubGet(fetchImpl, url, token) {
  const response = await fetchImpl(url, { headers: githubHeaders(token) });
  if (!response.ok) {
    throw new Error(`GitHub GET ${url} failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Paginate through all pages of a GitHub API endpoint.
 * @param {typeof globalThis.fetch} fetchImpl
 * @param {string} baseUrl
 * @param {string} token
 * @param {number} maxPages
 * @returns {Promise<unknown[]>}
 */
async function githubPaginateAll(fetchImpl, baseUrl, token, maxPages = 100) {
  const results = [];
  let page = 1;
  while (page <= maxPages) {
    const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}per_page=100&page=${page}`;
    const response = await fetchImpl(url, { headers: githubHeaders(token) });
    if (!response.ok) {
      throw new Error(`GitHub GET ${url} failed: HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(`GitHub GET ${url}: expected array response`);
    }
    results.push(...data);
    if (data.length < 100) {
      break;
    }
    page++;
    if (page > maxPages) {
      throw new Error(`GitHub API pagination exceeded ${maxPages} pages: ${baseUrl}`);
    }
  }
  return results;
}

/**
 * @param {string} value
 * @param {string} label
 */
function requireSha(value, label) {
  if (typeof value !== "string" || !SHA_PATTERN.test(value)) {
    throw new Error(`${label} must be lowercase 40-hex`);
  }
}

/**
 * @param {string} archivePath
 * @returns {{ size: number, sha256: string }}
 */
function snapshotFile(archivePath) {
  const stat = lstatSync(archivePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Not a regular file: ${archivePath}`);
  }
  const data = readFileSync(archivePath);
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");
  return { size: stat.size, sha256 };
}

/**
 * @param {string} archivePath
 * @param {{ size: number, sha256: string }} snapshot
 */
function verifySnapshot(archivePath, snapshot) {
  const stat = lstatSync(archivePath);
  if (stat.size !== snapshot.size) {
    throw new Error(`File size changed since snapshot: ${archivePath}`);
  }
  const data = readFileSync(archivePath);
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");
  if (sha256 !== snapshot.sha256) {
    throw new Error(`File content changed since snapshot: ${archivePath}`);
  }
}

/**
 * Enumerate store assets recursively.
 * @param {string} dir
 * @param {string} base
 * @returns {Array<{ absolutePath: string, relativePath: string, basename: string }>}
 */
function enumerateStoreAssets(dir, base) {
  return listFiles(dir, base, "store-assets")
    .map(({ absolutePath, relativePath }) => ({
      absolutePath,
      relativePath,
      basename: path.basename(absolutePath),
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * @typedef {object} PublishGitHubReleaseOptions
 * @property {"build" | "official"} kind
 * @property {string} repository
 * @property {string} appSlug
 * @property {string} expectedSha
 * @property {string} base
 * @property {string} full
 * @property {string} chromeArchive
 * @property {string} edgeArchive
 * @property {string} metadataPath
 * @property {string} [storeAssetsDirectory]
 * @property {string} token
 * @property {string} policyToken
 * @property {typeof globalThis.fetch} [fetchImpl]
 */

/**
 * @typedef {object} PublishGitHubReleaseResult
 * @property {boolean} claimed
 * @property {boolean} claim_created
 * @property {boolean} stale
 * @property {string} tag
 * @property {string} release_id
 * @property {boolean} published_now
 * @property {boolean} recovered_immutable
 */

/**
 * @typedef {object} AssertCurrentOfficialOptions
 * @property {string} repository
 * @property {string} base
 * @property {string} token
 * @property {typeof globalThis.fetch} [fetchImpl]
 */

/**
 * Validate shipping file paths and return the list of all shipping files.
 * @param {PublishGitHubReleaseOptions} opts
 * @returns {Array<{ absolutePath: string, basename: string }>}
 */
function buildShippingFiles(opts) {
  const { kind, full, chromeArchive, edgeArchive, metadataPath, storeAssetsDirectory } = opts;

  for (const [label, filePath] of /** @type {Array<[string, string]>} */ ([
    ["chromeArchive", chromeArchive],
    ["edgeArchive", edgeArchive],
    ["metadataPath", metadataPath],
  ])) {
    if (!path.isAbsolute(filePath)) {
      throw new Error(`${label} must be an absolute path: ${filePath}`);
    }
    const stat = lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`${label} is not a regular file: ${filePath}`);
    }
    const basename = path.basename(filePath);
    const expectedBasename =
      label === "metadataPath"
        ? "release-metadata.json"
        : label === "chromeArchive"
          ? `awesomeado-chrome-${full}.zip`
          : `awesomeado-edge-${full}.zip`;
    if (basename !== expectedBasename) {
      throw new Error(`${label} basename must be '${expectedBasename}': ${basename}`);
    }
  }

  const paths = [chromeArchive, edgeArchive, metadataPath];
  if (new Set(paths).size !== paths.length) {
    throw new Error("shipping file paths must be distinct");
  }

  /** @type {Array<{ absolutePath: string, basename: string }>} */
  const allShippingFiles = [
    { absolutePath: chromeArchive, basename: path.basename(chromeArchive) },
    { absolutePath: edgeArchive, basename: path.basename(edgeArchive) },
    { absolutePath: metadataPath, basename: path.basename(metadataPath) },
  ];

  if (kind === "official") {
    if (!storeAssetsDirectory) {
      throw new Error("storeAssetsDirectory is required for official releases");
    }
    const absStoreDir = path.resolve(storeAssetsDirectory);
    const storeDirStat = lstatSync(absStoreDir);
    if (storeDirStat.isSymbolicLink() || !storeDirStat.isDirectory()) {
      throw new Error(`storeAssetsDirectory is not a real directory: ${absStoreDir}`);
    }
    const storeAssets = enumerateStoreAssets(absStoreDir, absStoreDir);
    if (storeAssets.length === 0) {
      throw new Error("storeAssetsDirectory must contain at least one file");
    }
    for (const asset of storeAssets) {
      const basename = asset.basename;
      if (!SAFE_BASENAME.test(basename)) {
        throw new Error(`Unsafe store asset basename: ${basename}`);
      }
      const utf8Bytes = Buffer.byteLength(basename, "utf8");
      if (utf8Bytes > MAX_ASSET_BYTES) {
        throw new Error(`Store asset basename too long: ${basename}`);
      }
      allShippingFiles.push({ absolutePath: asset.absolutePath, basename });
    }
  }

  const basenames = allShippingFiles.map((f) => f.basename);
  const lowercaseBasenames = basenames.map((b) => b.toLowerCase());
  if (new Set(basenames).size !== basenames.length) {
    throw new Error("Duplicate asset basenames in shipping files");
  }
  if (new Set(lowercaseBasenames).size !== lowercaseBasenames.length) {
    throw new Error("Case-folded duplicate asset basenames in shipping files");
  }
  if (allShippingFiles.length > MAX_STORE_ASSETS) {
    throw new Error(`Too many shipping assets: ${allShippingFiles.length}`);
  }

  for (const { basename } of allShippingFiles) {
    if (!SAFE_BASENAME.test(basename)) {
      throw new Error(`Unsafe asset basename: ${basename}`);
    }
  }

  return allShippingFiles;
}

/**
 * Validate scalar identities for a publish request.
 * @param {PublishGitHubReleaseOptions} opts
 */
function validatePublishIdentities(opts) {
  const { kind, repository, appSlug, expectedSha, base, full } = opts;

  if (kind !== "build" && kind !== "official") {
    throw new Error(`kind must be 'build' or 'official': ${kind}`);
  }
  if (!REPO_PATTERN.test(repository)) {
    throw new Error(`repository must be owner/name: ${repository}`);
  }
  if (appSlug !== APPROVED_APP_SLUG) {
    throw new Error(`appSlug must be '${APPROVED_APP_SLUG}': ${appSlug}`);
  }
  requireSha(expectedSha, "expectedSha");
  if (!BASE_PATTERN.test(base)) {
    throw new Error(`base must be Major.Minor: ${base}`);
  }
  if (!FULL_PATTERN.test(full)) {
    throw new Error(`full must be Major.Minor.Build: ${full}`);
  }
  if (!full.startsWith(`${base}.`)) {
    throw new Error(`full must start with base: ${base} vs ${full}`);
  }
}

/**
 * Parse a release entry's vX.Y official tag, returning the typed record and
 * the tag regex match, or null if the entry is not an official-format release.
 * @param {unknown} rel
 * @returns {{ r: Record<string, unknown>, tagMatch: RegExpExecArray } | null}
 */
function parseRelease(rel) {
  const r = /** @type {Record<string, unknown>} */ (rel);
  if (!r.tag_name || typeof r.tag_name !== "string") return null;
  const tagMatch = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(r.tag_name);
  if (!tagMatch) return null;
  return { r, tagMatch };
}

/**
 * Filter `releases` to published (non-prerelease, non-draft) official entries
 * and return their parsed version numbers alongside the typed record.
 * @param {unknown[]} releases
 * @returns {Array<{ r: Record<string, unknown>, relMajor: number, relMinor: number }>}
 */
function filterOfficialReleases(releases) {
  return releases.flatMap((rel) => {
    const parsed = parseRelease(rel);
    if (!parsed) return [];
    const { r, tagMatch } = parsed;
    if (r.prerelease || r.draft) return [];
    return [{ r, relMajor: Number(tagMatch[1]), relMinor: Number(tagMatch[2]) }];
  });
}

/**
 * Claim the build tag (lightweight). Returns whether claim was newly created.
 * @param {typeof globalThis.fetch} fetchImpl
 * @param {string} apiBase
 * @param {string} token
 * @param {string} full
 * @param {string} expectedSha
 * @returns {Promise<boolean>} claim_created
 */
async function claimBuildTag(fetchImpl, apiBase, token, full, expectedSha) {
  const refPath = `refs/tags/v${full}`;
  let existingRef = null;
  try {
    existingRef = await githubGet(fetchImpl, `${apiBase}/git/ref/tags/v${full}`, token);
  } catch {
    // Not found - existingRef remains null
  }

  if (existingRef) {
    const ref = /** @type {Record<string, unknown>} */ (existingRef);
    const obj = /** @type {Record<string, unknown>} */ (ref.object ?? {});
    if (ref.ref !== refPath || obj.type !== "commit" || obj.sha !== expectedSha) {
      throw new Error(`Existing build tag v${full} does not match expected commit ${expectedSha}`);
    }
    return false;
  }

  const createResponse = await fetchImpl(`${apiBase}/git/refs`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/tags/v${full}`, sha: expectedSha }),
  });

  if (createResponse.status === 422) {
    const winner = await githubGet(fetchImpl, `${apiBase}/git/ref/tags/v${full}`, token);
    const winnerRef = /** @type {Record<string, unknown>} */ (winner);
    const winnerObj = /** @type {Record<string, unknown>} */ (winnerRef.object ?? {});
    if (winnerRef.ref !== refPath || winnerObj.type !== "commit" || winnerObj.sha !== expectedSha) {
      throw new Error(`Build tag v${full} race: winner does not match expected commit`);
    }
    return false;
  }

  if (!createResponse.ok) {
    throw new Error(`Failed to create build tag v${full}: HTTP ${createResponse.status}`);
  }

  return true;
}

/**
 * Claim the official annotated tag.
 * @param {typeof globalThis.fetch} fetchImpl
 * @param {string} apiBase
 * @param {string} token
 * @param {string} base
 * @param {string} full
 * @param {string} expectedSha
 * @returns {Promise<{ claim_created: boolean, recovered: boolean, lost: boolean }>}
 */
async function claimOfficialTag(fetchImpl, apiBase, token, base, full, expectedSha) {
  const claimMessage = JSON.stringify({
    base,
    format: 1,
    full,
    source_sha: expectedSha,
  });

  let existingRef = null;
  try {
    existingRef = await githubGet(fetchImpl, `${apiBase}/git/ref/tags/v${base}`, token);
  } catch {
    // Not found - existingRef remains null
  }

  if (existingRef) {
    const ref = /** @type {Record<string, unknown>} */ (existingRef);
    const obj = /** @type {Record<string, unknown>} */ (ref.object ?? {});
    if (obj.type !== "tag") {
      throw new Error(`Existing v${base} ref is not an annotated tag (type: ${obj.type})`);
    }
    const tagObjectSha = String(obj.sha);
    const tagObject = await githubGet(fetchImpl, `${apiBase}/git/tags/${tagObjectSha}`, token);
    const tag = /** @type {Record<string, unknown>} */ (tagObject);
    const tagCommit = /** @type {Record<string, unknown>} */ (tag.object ?? {});

    if (tag.tag !== `v${base}`) {
      throw new Error(`Existing v${base} tag has wrong tag name: ${tag.tag}`);
    }
    if (tagCommit.type !== "commit") {
      throw new Error(`Existing v${base} tag does not point to a commit`);
    }

    let existingClaim;
    try {
      existingClaim = JSON.parse(String(tag.message));
    } catch {
      throw new Error(`Existing v${base} tag has malformed claim message`);
    }

    const claimKeys = Object.keys(existingClaim).sort();
    if (JSON.stringify(claimKeys) !== JSON.stringify(["base", "format", "full", "source_sha"])) {
      throw new Error(`Existing v${base} tag claim has wrong keys`);
    }
    if (existingClaim.format !== 1) {
      throw new Error(`Existing v${base} tag claim has unsupported format`);
    }

    const commitSha = String(tagCommit.sha);
    if (
      existingClaim.full === full &&
      existingClaim.source_sha === expectedSha &&
      commitSha === expectedSha
    ) {
      return { claim_created: false, recovered: true, lost: false };
    }
    if (existingClaim.full !== full || existingClaim.source_sha !== expectedSha) {
      return { claim_created: false, recovered: false, lost: true };
    }
    throw new Error(`Existing v${base} tag claim is inconsistent`);
  }

  const tagResponse = await fetchImpl(`${apiBase}/git/tags`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      tag: `v${base}`,
      message: claimMessage,
      object: expectedSha,
      type: "commit",
    }),
  });

  if (!tagResponse.ok) {
    throw new Error(
      `Failed to create annotated tag object for v${base}: HTTP ${tagResponse.status}`,
    );
  }

  const tagData = await tagResponse.json();
  const tagDataObj = /** @type {Record<string, unknown>} */ (tagData);
  const tagObjectSha = String(tagDataObj.sha);

  const refResponse = await fetchImpl(`${apiBase}/git/refs`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: `refs/tags/v${base}`,
      sha: tagObjectSha,
    }),
  });

  if (refResponse.status === 422) {
    return await resolveOfficialTagRace(fetchImpl, apiBase, token, base, full, expectedSha);
  }

  if (!refResponse.ok) {
    throw new Error(`Failed to create ref for v${base}: HTTP ${refResponse.status}`);
  }

  return { claim_created: true, recovered: false, lost: false };
}

/**
 * Resolve a 422 race on the official tag ref.
 * @param {typeof globalThis.fetch} fetchImpl
 * @param {string} apiBase
 * @param {string} token
 * @param {string} base
 * @param {string} full
 * @param {string} expectedSha
 * @returns {Promise<{ claim_created: boolean, recovered: boolean, lost: boolean }>}
 */
async function resolveOfficialTagRace(fetchImpl, apiBase, token, base, full, expectedSha) {
  const winner = await githubGet(fetchImpl, `${apiBase}/git/ref/tags/v${base}`, token);
  const winnerRef = /** @type {Record<string, unknown>} */ (winner);
  const winnerObj = /** @type {Record<string, unknown>} */ (winnerRef.object ?? {});
  if (winnerObj.type !== "tag") {
    throw new Error(`Race winner for v${base} is not an annotated tag`);
  }
  const winnerTagSha = String(winnerObj.sha);
  const winnerTag = await githubGet(fetchImpl, `${apiBase}/git/tags/${winnerTagSha}`, token);
  const wt = /** @type {Record<string, unknown>} */ (winnerTag);
  let winnerClaim;
  try {
    winnerClaim = JSON.parse(String(wt.message));
  } catch {
    throw new Error(`Race winner v${base} tag has malformed claim`);
  }
  const wtCommit = /** @type {Record<string, unknown>} */ (wt.object ?? {});
  if (
    winnerClaim.full === full &&
    winnerClaim.source_sha === expectedSha &&
    wtCommit.sha === expectedSha
  ) {
    return { claim_created: false, recovered: true, lost: false };
  }
  return { claim_created: false, recovered: false, lost: true };
}

/**
 * Find or create a draft release for the claimed tag.
 * @param {typeof globalThis.fetch} fetchImpl
 * @param {string} apiBase
 * @param {string} token
 * @param {string} claimedTag
 * @param {unknown[]} existingReleases
 * @param {{ kind: "build"|"official", base: string, full: string, expectedSha: string, authorId: number, authorLogin: string }}  releaseOpts
 * @returns {Promise<{ releaseId: number, alreadyPublished: boolean }>}
 */
async function findOrCreateDraftRelease(
  fetchImpl,
  apiBase,
  token,
  claimedTag,
  existingReleases,
  releaseOpts,
) {
  const { kind, base, full, expectedSha, authorId, authorLogin } = releaseOpts;
  const isPrerelease = kind === "build";
  const releaseBody = JSON.stringify({
    base,
    format: 1,
    full,
    kind,
    source_sha: expectedSha,
  });

  const releasesForTag = existingReleases.filter(
    (r) => /** @type {Record<string, unknown>} */ (r).tag_name === claimedTag,
  );
  if (releasesForTag.length > 1) {
    throw new Error(`Multiple releases found for tag ${claimedTag}`);
  }

  if (releasesForTag.length === 0) {
    const createResp = await fetchImpl(`${apiBase}/releases`, {
      method: "POST",
      headers: { ...githubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: claimedTag,
        name: `AwesomeADO ${claimedTag}`,
        body: releaseBody,
        draft: true,
        prerelease: isPrerelease,
        generate_release_notes: false,
        make_latest: "false",
      }),
    });

    if (!createResp.ok) {
      throw new Error(`Failed to create release for ${claimedTag}: HTTP ${createResp.status}`);
    }

    const createData = /** @type {Record<string, unknown>} */ (await createResp.json());
    const author = /** @type {Record<string, unknown>} */ (createData.author ?? {});
    if (author.id !== authorId || author.login !== authorLogin || author.type !== "Bot") {
      throw new Error(
        `Release create response has unexpected author: ${JSON.stringify(author.login)}`,
      );
    }
    return { releaseId: Number(createData.id), alreadyPublished: false };
  }

  const existingRelease = /** @type {Record<string, unknown>} */ (releasesForTag[0]);
  const author = /** @type {Record<string, unknown>} */ (existingRelease.author ?? {});
  if (author.id !== authorId || author.login !== authorLogin || author.type !== "Bot") {
    throw new Error(`Existing release for ${claimedTag} has unexpected author`);
  }

  if (existingRelease.draft === false) {
    if (!existingRelease.immutable) {
      throw new Error(`Published release for ${claimedTag} is not immutable`);
    }
    return { releaseId: Number(existingRelease.id), alreadyPublished: true };
  }

  return { releaseId: Number(existingRelease.id), alreadyPublished: false };
}

/**
 * Upload any missing assets to the draft release.
 * @param {typeof globalThis.fetch} fetchImpl
 * @param {string} apiBase
 * @param {string} token
 * @param {number} releaseId
 * @param {Array<{ absolutePath: string, basename: string }>} allShippingFiles
 * @param {Map<string, { size: number, sha256: string }>} snapshots
 * @param {string} claimedTag
 * @returns {Promise<void>}
 */
async function uploadMissingAssets(
  fetchImpl,
  apiBase,
  token,
  releaseId,
  allShippingFiles,
  snapshots,
  claimedTag,
) {
  const releaseData = /** @type {Record<string, unknown>} */ (
    await githubGet(fetchImpl, `${apiBase}/releases/${releaseId}`, token)
  );
  const existingAssets = Array.isArray(releaseData.assets) ? releaseData.assets : [];
  const expectedBasenames = new Set(allShippingFiles.map((f) => f.basename));

  for (const asset of existingAssets) {
    const a = /** @type {Record<string, unknown>} */ (asset);
    if (!expectedBasenames.has(String(a.name))) {
      throw new Error(`Unexpected asset in release ${claimedTag}: ${a.name}`);
    }
  }

  for (const asset of existingAssets) {
    const a = /** @type {Record<string, unknown>} */ (asset);
    const assetName = String(a.name);
    if (
      a.state === "starter" &&
      a.size === 0 &&
      expectedBasenames.has(assetName) &&
      typeof a.id === "number"
    ) {
      const deleteResp = await fetchImpl(`${apiBase}/releases/assets/${a.id}`, {
        method: "DELETE",
        headers: githubHeaders(token),
      });
      if (deleteResp.status !== 204) {
        throw new Error(`Failed to delete starter asset ${assetName}: HTTP ${deleteResp.status}`);
      }
    } else if (a.state === "uploaded" && typeof a.size === "number") {
      const fileForAsset = allShippingFiles.find((f) => f.basename === assetName);
      if (!fileForAsset) {
        throw new Error(`No local file for uploaded asset: ${assetName}`);
      }
      const snapshot = snapshots.get(fileForAsset.absolutePath);
      if (snapshot && a.size !== snapshot.size) {
        throw new Error(
          `Uploaded asset ${assetName} size mismatch: expected ${snapshot.size}, got ${a.size}`,
        );
      }
    }
  }

  const currentRelease = /** @type {Record<string, unknown>} */ (
    await githubGet(fetchImpl, `${apiBase}/releases/${releaseId}`, token)
  );
  const currentAssets = Array.isArray(currentRelease.assets) ? currentRelease.assets : [];
  const uploadedAssetNames = new Set(
    currentAssets
      .filter((a) => /** @type {Record<string, unknown>} */ (a).state === "uploaded")
      .map((a) => String(/** @type {Record<string, unknown>} */ (a).name)),
  );

  const uploadUrl = String(currentRelease.upload_url ?? "").replace(/\{[^}]+\}/g, "");
  const sortedFiles = [...allShippingFiles].sort((a, b) => a.basename.localeCompare(b.basename));

  for (const file of sortedFiles) {
    if (uploadedAssetNames.has(file.basename)) {
      continue;
    }
    const snapshot = snapshots.get(file.absolutePath);
    if (snapshot) {
      verifySnapshot(file.absolutePath, snapshot);
    }
    const contentType = file.basename.endsWith(".zip")
      ? "application/zip"
      : file.basename.endsWith(".json")
        ? "application/json"
        : "application/octet-stream";
    const fileData = readFileSync(file.absolutePath);
    const uploadResp = await fetchImpl(`${uploadUrl}?name=${encodeURIComponent(file.basename)}`, {
      method: "POST",
      headers: {
        ...githubHeaders(token),
        "Content-Type": contentType,
        "Content-Length": String(fileData.length),
      },
      body: fileData,
    });
    if (!uploadResp.ok) {
      throw new Error(`Failed to upload asset ${file.basename}: HTTP ${uploadResp.status}`);
    }
  }

  const finalRelease = /** @type {Record<string, unknown>} */ (
    await githubGet(fetchImpl, `${apiBase}/releases/${releaseId}`, token)
  );
  const finalAssets = Array.isArray(finalRelease.assets) ? finalRelease.assets : [];
  const finalAssetNames = new Set(
    finalAssets.map((a) => String(/** @type {Record<string, unknown>} */ (a).name)),
  );
  for (const file of allShippingFiles) {
    if (!finalAssetNames.has(file.basename)) {
      throw new Error(`Asset missing after upload: ${file.basename}`);
    }
  }
}

/**
 * Publish a draft release, checking for stale state first.
 * @param {typeof globalThis.fetch} fetchImpl
 * @param {string} apiBase
 * @param {string} token
 * @param {string} policyToken
 * @param {number} releaseId
 * @param {string} claimedTag
 * @param {string} base
 * @param {boolean} isPrerelease
 * @returns {Promise<{ stale: boolean }>}
 */
async function publishDraftRelease(
  fetchImpl,
  apiBase,
  token,
  policyToken,
  releaseId,
  claimedTag,
  base,
  isPrerelease,
) {
  if (!isPrerelease) {
    const latestReleases = await githubPaginateAll(fetchImpl, `${apiBase}/releases`, token);
    const [baseMajor = 0, baseMinor = 0] = base.split(".").map(Number);
    for (const rel of latestReleases) {
      const parsed = parseRelease(rel);
      if (!parsed || parsed.r.tag_name === `v${base}`) continue;
      const { r, tagMatch } = parsed;
      const relMajor = Number(tagMatch[1]);
      const relMinor = Number(tagMatch[2]);
      if (
        !r.prerelease &&
        !r.draft &&
        (relMajor > baseMajor || (relMajor === baseMajor && relMinor > baseMinor))
      ) {
        return { stale: true };
      }
    }

    const latestPolicy = await githubGet(fetchImpl, `${apiBase}/immutable-releases`, policyToken);
    const lp = /** @type {Record<string, unknown>} */ (latestPolicy);
    if (lp.enabled !== true || lp.enforced_by_owner !== true) {
      throw new Error("Immutable release policy no longer valid before publish");
    }
  }

  const patchResp = await fetchImpl(`${apiBase}/releases/${releaseId}`, {
    method: "PATCH",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      draft: false,
      prerelease: isPrerelease,
      make_latest: isPrerelease ? "false" : "true",
    }),
  });

  if (!patchResp.ok) {
    throw new Error(`Failed to publish release ${claimedTag}: HTTP ${patchResp.status}`);
  }

  const patchData = /** @type {Record<string, unknown>} */ (await patchResp.json());
  if (!patchData.immutable || patchData.draft !== false) {
    throw new Error(`Published release ${claimedTag} is not immutable or still draft`);
  }

  return { stale: false };
}

/**
 * Publish or recover an immutable GitHub release.
 * @param {PublishGitHubReleaseOptions} options
 * @returns {Promise<PublishGitHubReleaseResult>}
 */
export async function publishGitHubRelease(options) {
  const {
    kind,
    repository,
    expectedSha,
    base,
    full,
    token,
    policyToken,
    fetchImpl = fetch,
  } = options;

  validatePublishIdentities(options);
  const allShippingFiles = buildShippingFiles(options);
  const snapshots = new Map(
    allShippingFiles.map((f) => [f.absolutePath, snapshotFile(f.absolutePath)]),
  );

  const apiBase = `https://api.github.com/repos/${repository}`;

  const botLogin = `${APPROVED_APP_SLUG}[bot]`;
  const botUser = await githubGet(
    fetchImpl,
    `https://api.github.com/users/${encodeURIComponent(botLogin)}`,
    token,
  );
  const botObj = /** @type {Record<string, unknown>} */ (botUser);
  if (
    typeof botObj.id !== "number" ||
    !Number.isSafeInteger(botObj.id) ||
    botObj.id <= 0 ||
    botObj.login !== botLogin ||
    botObj.type !== "Bot"
  ) {
    throw new Error(`App bot identity check failed: unexpected user ${JSON.stringify(botLogin)}`);
  }
  const authorId = botObj.id;
  const authorLogin = botLogin;

  const releases = await githubPaginateAll(fetchImpl, `${apiBase}/releases`, token);

  for (const rel of releases) {
    const parsed = parseRelease(rel);
    if (!parsed) continue;
    const { r } = parsed;
    if (!r.prerelease && !r.draft && !r.immutable) {
      throw new Error(`Mutable published official release exists: ${r.tag_name}`);
    }
  }

  if (kind === "official") {
    const [baseMajor = 0, baseMinor = 0] = base.split(".").map(Number);
    for (const { relMajor, relMinor } of filterOfficialReleases(releases)) {
      if (relMajor > baseMajor || (relMajor === baseMajor && relMinor > baseMinor)) {
        return {
          claimed: false,
          claim_created: false,
          stale: true,
          tag: `v${base}`,
          release_id: "",
          published_now: false,
          recovered_immutable: false,
        };
      }
    }
  }

  const policy = await githubGet(fetchImpl, `${apiBase}/immutable-releases`, policyToken);
  const policyObj = /** @type {Record<string, unknown>} */ (policy);
  if (policyObj.enabled !== true || policyObj.enforced_by_owner !== true) {
    throw new Error("Immutable release policy must be enabled and enforced_by_owner");
  }

  /** @type {boolean} */
  let claim_created;
  const claimedTag = kind === "build" ? `v${full}` : `v${base}`;

  if (kind === "build") {
    claim_created = await claimBuildTag(fetchImpl, apiBase, token, full, expectedSha);
  } else {
    const claimResult = await claimOfficialTag(fetchImpl, apiBase, token, base, full, expectedSha);
    if (claimResult.lost) {
      return {
        claimed: false,
        claim_created: false,
        stale: false,
        tag: `v${base}`,
        release_id: "",
        published_now: false,
        recovered_immutable: false,
      };
    }
    claim_created = claimResult.claim_created;
  }

  const { releaseId, alreadyPublished } = await findOrCreateDraftRelease(
    fetchImpl,
    apiBase,
    token,
    claimedTag,
    releases,
    { kind, base, full, expectedSha, authorId, authorLogin },
  );

  if (alreadyPublished) {
    return {
      claimed: true,
      claim_created,
      stale: false,
      tag: claimedTag,
      release_id: String(releaseId),
      published_now: false,
      recovered_immutable: true,
    };
  }

  await uploadMissingAssets(
    fetchImpl,
    apiBase,
    token,
    releaseId,
    allShippingFiles,
    snapshots,
    claimedTag,
  );

  const { stale } = await publishDraftRelease(
    fetchImpl,
    apiBase,
    token,
    policyToken,
    releaseId,
    claimedTag,
    base,
    kind === "build",
  );

  if (stale) {
    return {
      claimed: true,
      claim_created,
      stale: true,
      tag: claimedTag,
      release_id: String(releaseId),
      published_now: false,
      recovered_immutable: false,
    };
  }

  return {
    claimed: true,
    claim_created,
    stale: false,
    tag: claimedTag,
    release_id: String(releaseId),
    published_now: true,
    recovered_immutable: false,
  };
}

/**
 * Assert that the given base is the current maximum official release.
 * @param {AssertCurrentOfficialOptions} options
 * @returns {Promise<void>}
 */
export async function assertCurrentOfficial(options) {
  const { repository, base, token, fetchImpl = fetch } = options;

  if (!REPO_PATTERN.test(repository)) {
    throw new Error(`repository must be owner/name: ${repository}`);
  }
  if (!BASE_PATTERN.test(base)) {
    throw new Error(`base must be Major.Minor: ${base}`);
  }

  const apiBase = `https://api.github.com/repos/${repository}`;
  const releases = await githubPaginateAll(fetchImpl, `${apiBase}/releases`, token);

  const [baseMajor = 0, baseMinor = 0] = base.split(".").map(Number);
  let found = false;
  for (const { r, relMajor, relMinor } of filterOfficialReleases(releases)) {
    if (relMajor === baseMajor && relMinor === baseMinor) {
      found = true;
    } else if (relMajor > baseMajor || (relMajor === baseMajor && relMinor > baseMinor)) {
      throw new Error(`Official release ${r.tag_name} is newer than v${base}; base is stale`);
    }
  }

  if (!found) {
    throw new Error(`Official release v${base} does not exist`);
  }
}

/**
 * Emit result fields to GITHUB_OUTPUT or stdout.
 * @param {PublishGitHubReleaseResult} result
 */
function emitPublishResult(result) {
  const outputFile = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(result).map(([k, v]) => `${k}=${String(v)}`);
  if (outputFile) {
    appendFileSync(outputFile, lines.join("\n") + "\n", "utf8");
  } else {
    process.stdout.write(JSON.stringify(result) + "\n");
  }
}

/** @param {string[]} args @returns {{ subcommand: string, flags: Map<string, string> }} */
function parseCli(args) {
  const [subcommand, ...rest] = args;
  if (subcommand !== "publish" && subcommand !== "assert-current") {
    throw new Error(`Unknown subcommand: ${subcommand ?? "<missing>"}`);
  }

  const publishFlags = new Set([
    "--kind",
    "--repository",
    "--app-slug",
    "--expected-sha",
    "--base",
    "--full",
    "--chrome",
    "--edge",
    "--metadata",
    "--store-assets",
  ]);
  const assertCurrentFlags = new Set(["--repository", "--base"]);
  const allowedFlags = subcommand === "publish" ? publishFlags : assertCurrentFlags;

  const flags = new Map();
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (!flag || !allowedFlags.has(flag) || !value || value.startsWith("--") || flags.has(flag)) {
      throw new Error(`Invalid ${subcommand} argument: ${flag ?? "<missing>"}`);
    }
    flags.set(flag, value);
  }

  return { subcommand, flags };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  const token = process.env.GH_TOKEN;
  if (!token) {
    console.error("GH_TOKEN is required");
    process.exitCode = 1;
  } else {
    try {
      const { subcommand, flags } = parseCli(process.argv.slice(2));
      if (subcommand === "publish") {
        const policyToken = process.env.IMMUTABLE_RELEASES_READ_TOKEN;
        if (!policyToken) {
          throw new Error("IMMUTABLE_RELEASES_READ_TOKEN is required for publish");
        }
        const kind = flags.get("--kind");
        if (kind !== "build" && kind !== "official") {
          throw new Error(`--kind must be build or official: ${kind}`);
        }
        const appSlug = flags.get("--app-slug");
        if (appSlug !== APPROVED_APP_SLUG) {
          throw new Error(`--app-slug must be '${APPROVED_APP_SLUG}': ${appSlug}`);
        }
        const result = await publishGitHubRelease({
          kind,
          repository: flags.get("--repository") ?? "",
          appSlug,
          expectedSha: flags.get("--expected-sha") ?? "",
          base: flags.get("--base") ?? "",
          full: flags.get("--full") ?? "",
          chromeArchive: flags.get("--chrome") ?? "",
          edgeArchive: flags.get("--edge") ?? "",
          metadataPath: flags.get("--metadata") ?? "",
          storeAssetsDirectory: flags.get("--store-assets"),
          token,
          policyToken,
        });
        emitPublishResult(result);
      } else {
        await assertCurrentOfficial({
          repository: flags.get("--repository") ?? "",
          base: flags.get("--base") ?? "",
          token,
        });
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
