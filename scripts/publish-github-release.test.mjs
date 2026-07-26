import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { assertCurrentOfficial, publishGitHubRelease } from "./publish-github-release.mjs";

const FAKE_SHA = "a".repeat(40);
const FAKE_SHA2 = "b".repeat(40);
const REPO = "RazMake/AwesomeAdo";
const APP_SLUG = "awesomeado-release-publisher";
const TOKEN = "fake-token";
const POLICY_TOKEN = "fake-policy-token";

let tmpCount = 0;
function mktemp() {
  return join(tmpdir(), `pub-gh-test-${Date.now()}-${++tmpCount}`);
}

/**
 * Create a minimal set of artifact files for testing.
 * @param {string} dir
 * @param {string} full
 * @returns {{ chrome: string, edge: string, metadata: string, storeAssets: string }}
 */
function createArtifacts(dir, full) {
  mkdirSync(dir, { recursive: true });
  const chrome = join(dir, `awesomeado-chrome-${full}.zip`);
  const edge = join(dir, `awesomeado-edge-${full}.zip`);
  const metadata = join(dir, "release-metadata.json");
  const storeAssets = join(dir, "store-assets");
  mkdirSync(storeAssets, { recursive: true });
  writeFileSync(chrome, "fake-zip-content");
  writeFileSync(edge, "fake-zip-content");
  writeFileSync(
    metadata,
    JSON.stringify({
      format: 1,
      base: "0.1",
      build: "1",
      full,
      GITHUB_SHA: FAKE_SHA,
    }),
  );
  // At least one file in store-assets to satisfy the non-empty check
  writeFileSync(join(storeAssets, "README.md"), "Store assets.");
  return { chrome, edge, metadata, storeAssets };
}

/** @param {unknown} data @param {number} [status] */
function jsonResp(data, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    json: async () => data,
  };
}

/** @param {number} status @param {string} message */
function errorResp(status, message) {
  return {
    status,
    ok: false,
    headers: { get: () => null },
    json: async () => ({ message }),
  };
}

// Default fixture state for the stateful GitHub fetch fake; merged under caller overrides.
const STATEFUL_FETCH_DEFAULTS = {
  existingBuildTag: false,
  existingOfficialTag: null,
  officialReleases: [],
  buildReleases: [],
  immutablePolicyEnabled: true,
  botId: 12345,
  existingDraftRelease: null,
  race422OnRef: false,
  race422OfficialRef: false,
  mutableOfficialRelease: false,
};

// The release-publisher app authors every bot-created release/tag; sharing one author object
// keeps the fixtures free of copy-pasted identity blocks (jscpd) — tests only read these fields.
function botAuthor(/** @type {number} */ botId) {
  return { id: botId, login: "awesomeado-release-publisher[bot]", type: "Bot" };
}

/** @param {Record<string, any>} ctx @returns {Array<Record<string, any>>} */
function buildReleasesList(ctx) {
  const author = botAuthor(ctx.botId);
  return [
    ...ctx.officialReleases.map((/** @type {any} */ r, /** @type {any} */ i) => ({
      id: 100 + i,
      tag_name: `v${r.base}`,
      name: `AwesomeADO v${r.base}`,
      body: JSON.stringify({
        base: r.base,
        format: 1,
        full: r.full,
        kind: "official",
        source_sha: r.sha,
      }),
      draft: false,
      prerelease: false,
      immutable: !ctx.mutableOfficialRelease,
      author,
      assets: [],
      upload_url: `${ctx.apiBase}/releases/999/assets{?name,label}`,
    })),
    ...ctx.buildReleases.map((/** @type {any} */ r, /** @type {any} */ i) => ({
      id: 200 + i,
      tag_name: `v${r.full}`,
      draft: false,
      prerelease: true,
      immutable: true,
      author,
      assets: [],
    })),
    ...(ctx.existingDraftRelease
      ? [
          {
            id: ctx.existingDraftRelease.id,
            tag_name: ctx.existingDraftRelease.tag_name ?? "v0.1",
            draft: true,
            prerelease: false,
            immutable: undefined,
            author,
            assets: ctx.existingDraftRelease.assets ?? [],
            upload_url: `${ctx.apiBase}/releases/${ctx.existingDraftRelease.id}/assets{?name,label}`,
          },
        ]
      : []),
  ];
}

/** @param {Record<string, any>} ctx @param {string} urlPath */
function singleReleaseById(ctx, urlPath) {
  const idMatch = urlPath.match(/\/releases\/(\d+)$/);
  const id = Number(idMatch?.[1]);
  const assets = ctx.uploadedAssets.get(id) ?? [];
  if (ctx.existingDraftRelease && id === ctx.existingDraftRelease.id) {
    return jsonResp({
      id,
      tag_name: ctx.existingDraftRelease.tag_name ?? "v0.1",
      draft: true,
      prerelease: false,
      immutable: undefined,
      author: botAuthor(ctx.botId),
      assets: ctx.existingDraftRelease.assets ?? assets,
      upload_url: `${ctx.apiBase}/releases/${id}/assets{?name,label}`,
    });
  }
  return jsonResp({
    id: id || 999,
    tag_name: "v0.1.1",
    draft: true,
    prerelease: false,
    immutable: undefined,
    author: botAuthor(ctx.botId),
    assets,
    upload_url: `${ctx.apiBase}/releases/${id || 999}/assets{?name,label}`,
  });
}

/** @param {Record<string, any>} ctx */
function officialTagRef(ctx) {
  if (!ctx.existingOfficialTag && !ctx.race422OfficialRef) {
    return errorResp(404, "Not Found");
  }
  if (ctx.existingOfficialTag) {
    return jsonResp({ ref: "refs/tags/v0.1", object: { type: "tag", sha: "tag-obj-sha-111" } });
  }
  // race422OfficialRef: first check returns 404 (before create), then winner after race
  return errorResp(404, "Not Found");
}

/** @param {Record<string, any>} ctx */
function officialTagObject(ctx) {
  const tagFull = ctx.existingOfficialTag?.full ?? "0.1.1";
  const tagSha = ctx.existingOfficialTag?.sha ?? FAKE_SHA;
  return jsonResp({
    tag: "v0.1",
    message: JSON.stringify({ base: "0.1", format: 1, full: tagFull, source_sha: tagSha }),
    object: { type: "commit", sha: tagSha },
  });
}

/** @param {Record<string, any>} ctx @param {any} init */
function createRef(ctx, init) {
  const body = JSON.parse(/** @type {string} */ (init.body));
  if (body.ref?.includes("v0.1.") && ctx.race422OnRef) {
    return errorResp(422, "Reference already exists");
  }
  if (body.ref === "refs/tags/v0.1" && ctx.race422OfficialRef) {
    return errorResp(422, "Reference already exists");
  }
  return jsonResp({ ref: body.ref, object: { sha: body.sha } }, 201);
}

/** @param {Record<string, any>} ctx */
function resolveRaceWinnerRef(ctx) {
  if (ctx.race422OfficialRef) {
    return jsonResp({ ref: "refs/tags/v0.1", object: { type: "tag", sha: "new-tag-obj-sha" } });
  }
  if (ctx.race422OnRef) {
    return jsonResp({ ref: "refs/tags/v0.1.1", object: { type: "commit", sha: FAKE_SHA } });
  }
  // Neither race flag set: this branch matched the URL but yields no response, so the caller
  // must fall through to the remaining routes exactly as the original if-ladder did.
  return undefined;
}

/** @param {Record<string, any>} ctx @param {any} init */
function createRelease(ctx, init) {
  const body = JSON.parse(/** @type {string} */ (init.body));
  ctx.uploadedAssets.set(999, []);
  return jsonResp(
    {
      id: 999,
      tag_name: body.tag_name,
      draft: body.draft,
      prerelease: body.prerelease,
      author: botAuthor(ctx.botId),
      assets: [],
      upload_url: `${ctx.apiBase}/releases/999/assets{?name,label}`,
    },
    201,
  );
}

/** @param {Record<string, any>} ctx @param {URL} urlObj @param {string} urlPath */
function uploadAsset(ctx, urlObj, urlPath) {
  const assetName = urlObj.searchParams.get("name") ?? "";
  const idMatch = urlPath.match(/\/releases\/(\d+)\/assets/);
  const releaseId = Number(idMatch?.[1] ?? 999);
  const existing = ctx.uploadedAssets.get(releaseId) ?? [];
  existing.push({ id: existing.length + 1, name: assetName, state: "uploaded", size: 100 });
  ctx.uploadedAssets.set(releaseId, existing);
  return jsonResp({ id: existing.length, name: assetName, state: "uploaded", size: 100 }, 201);
}

// Route table replaces the fetch mock's URL if/else ladder. Order mirrors the original ladder
// exactly (earlier matchers win). A `run` returning undefined means "matched but produced no
// response" so the loop falls through to later routes — reproducing the ladder's fall-through
// for the post-422 race-resolution branch.
const GITHUB_ROUTES = [
  {
    test: (/** @type {string} */ m, /** @type {string} */ url) =>
      m === "GET" && url.includes("/users/awesomeado-release-publisher"),
    run: (/** @type {Record<string, any>} */ ctx) => jsonResp(botAuthor(ctx.botId)),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ url, /** @type {string} */ p) =>
      m === "GET" && p.endsWith("/releases") && !url.includes("/tags/"),
    run: (/** @type {Record<string, any>} */ ctx) => jsonResp(buildReleasesList(ctx)),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ _url, /** @type {string} */ p) =>
      m === "GET" && /\/releases\/\d+$/.test(p) && !p.includes("/assets"),
    run: (/** @type {Record<string, any>} */ ctx, /** @type {Record<string, any>} */ req) =>
      singleReleaseById(ctx, req.urlPath),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ _url, /** @type {string} */ p) =>
      m === "GET" && p.includes("/immutable-releases"),
    run: (/** @type {Record<string, any>} */ ctx) =>
      jsonResp({
        enabled: ctx.immutablePolicyEnabled,
        enforced_by_owner: ctx.immutablePolicyEnabled,
      }),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ _url, /** @type {string} */ p) =>
      m === "GET" && p.includes("/git/ref/tags/v0.1.1"),
    run: (/** @type {Record<string, any>} */ ctx) =>
      ctx.existingBuildTag
        ? jsonResp({ ref: "refs/tags/v0.1.1", object: { type: "commit", sha: FAKE_SHA } })
        : errorResp(404, "Not Found"),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ _url, /** @type {string} */ p) =>
      m === "GET" && /\/git\/ref\/tags\/v0\.1$/.test(p),
    run: (/** @type {Record<string, any>} */ ctx) => officialTagRef(ctx),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ _url, /** @type {string} */ p) =>
      m === "GET" && p.includes("/git/tags/tag-obj-sha-111"),
    run: (/** @type {Record<string, any>} */ ctx) => officialTagObject(ctx),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ _url, /** @type {string} */ p) =>
      m === "POST" && p.endsWith("/git/tags"),
    run: () => jsonResp({ sha: "new-tag-obj-sha" }, 201),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ _url, /** @type {string} */ p) =>
      m === "POST" && p.endsWith("/git/refs"),
    run: (/** @type {Record<string, any>} */ ctx, /** @type {Record<string, any>} */ req) =>
      createRef(ctx, req.init),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ _url, /** @type {string} */ p) =>
      m === "GET" && (/\/git\/ref\/tags\/v0\.1$/.test(p) || p.includes("/git/ref/tags/v0.1.")),
    run: (/** @type {Record<string, any>} */ ctx) => resolveRaceWinnerRef(ctx),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ _url, /** @type {string} */ p) =>
      m === "GET" && p.includes("/git/tags/new-tag-obj-sha"),
    run: () =>
      jsonResp({
        tag: "v0.1",
        message: JSON.stringify({ base: "0.1", format: 1, full: "0.1.1", source_sha: FAKE_SHA }),
        object: { type: "commit", sha: FAKE_SHA },
      }),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ _url, /** @type {string} */ p) =>
      m === "POST" && p.endsWith("/releases"),
    run: (/** @type {Record<string, any>} */ ctx, /** @type {Record<string, any>} */ req) =>
      createRelease(ctx, req.init),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ _url, /** @type {string} */ p) =>
      m === "POST" && p.includes("/assets"),
    run: (/** @type {Record<string, any>} */ ctx, /** @type {Record<string, any>} */ req) =>
      uploadAsset(ctx, req.urlObj, req.urlPath),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ _url, /** @type {string} */ p) =>
      m === "PATCH" && /\/releases\/\d+$/.test(p),
    run: () =>
      jsonResp({ id: 999, draft: false, prerelease: false, immutable: true, tag_name: "v0.1" }),
  },
  {
    test: (/** @type {string} */ m, /** @type {string} */ _url, /** @type {string} */ p) =>
      m === "DELETE" && p.includes("/releases/assets/"),
    run: () => ({ status: 204, ok: true, headers: { get: () => null }, json: async () => ({}) }),
  },
];

/**
 * Build a minimal stateful HTTP fake for the GitHub API.
 * @param {Record<string, any>} [opts]
 */
function buildStatefulFetch(opts = {}) {
  const calls = /** @type {Array<Record<string, any>>} */ ([]);
  // Track uploaded assets per release id
  const uploadedAssets = new Map();

  // Spread over the defaults instead of per-field destructuring defaults: this keeps the
  // fixture's cyclomatic complexity flat (each `= default` in a destructure is a branch) while
  // preserving the original behavior — omitted keys fall back to defaults, every test either
  // sets a concrete value or leaves the key out entirely.
  const ctx = {
    ...STATEFUL_FETCH_DEFAULTS,
    ...opts,
    uploadedAssets,
    apiBase: `https://api.github.com/repos/${REPO}`,
  };

  const fetchImpl = async (/** @type {any} */ url, /** @type {any} */ init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url, method });
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname;
    const req = { url, urlObj, urlPath, init };

    for (const route of GITHUB_ROUTES) {
      if (!route.test(method, url, urlPath)) continue;
      const response = route.run(ctx, req);
      if (response !== undefined) return response;
    }

    console.warn(`Unhandled URL: ${method} ${url}`);
    return errorResp(500, "Unhandled URL in mock");
  };

  return { fetchImpl: /** @type {any} */ (fetchImpl), calls };
}

describe("publishGitHubRelease — appSlug validation", () => {
  it("rejects wrong appSlug before any network request", async () => {
    const dir = mktemp();
    const { chrome, edge, metadata } = createArtifacts(dir, "0.1.1");
    const { fetchImpl, calls } = buildStatefulFetch();

    await assert.rejects(
      () =>
        publishGitHubRelease({
          kind: "build",
          repository: REPO,
          appSlug: "wrong-app",
          expectedSha: FAKE_SHA,
          base: "0.1",
          full: "0.1.1",
          chromeArchive: chrome,
          edgeArchive: edge,
          metadataPath: metadata,
          token: TOKEN,
          policyToken: POLICY_TOKEN,
          fetchImpl,
        }),
      /appSlug must be/,
    );
    assert.equal(calls.length, 0, "No network requests before appSlug validation");

    await rm(dir, { recursive: true });
  });
});

describe("publishGitHubRelease — build release", () => {
  it("creates a new build release successfully", async () => {
    const dir = mktemp();
    const { chrome, edge, metadata } = createArtifacts(dir, "0.1.1");
    const { fetchImpl } = buildStatefulFetch({});

    const result = await publishGitHubRelease({
      kind: "build",
      repository: REPO,
      appSlug: APP_SLUG,
      expectedSha: FAKE_SHA,
      base: "0.1",
      full: "0.1.1",
      chromeArchive: chrome,
      edgeArchive: edge,
      metadataPath: metadata,
      token: TOKEN,
      policyToken: POLICY_TOKEN,
      fetchImpl,
    });

    assert.equal(result.claimed, true);
    assert.equal(result.stale, false);
    assert.equal(result.published_now, true);
    assert.equal(result.recovered_immutable, false);

    await rm(dir, { recursive: true });
  });

  it("handles 422 race on build tag ref", async () => {
    const dir = mktemp();
    const { chrome, edge, metadata } = createArtifacts(dir, "0.1.1");
    const { fetchImpl } = buildStatefulFetch({
      race422OnRef: true,
      existingBuildTag: true,
    });

    const result = await publishGitHubRelease({
      kind: "build",
      repository: REPO,
      appSlug: APP_SLUG,
      expectedSha: FAKE_SHA,
      base: "0.1",
      full: "0.1.1",
      chromeArchive: chrome,
      edgeArchive: edge,
      metadataPath: metadata,
      token: TOKEN,
      policyToken: POLICY_TOKEN,
      fetchImpl,
    });

    assert.equal(result.claimed, true);

    await rm(dir, { recursive: true });
  });
});

describe("publishGitHubRelease — official release", () => {
  it("creates a new official release successfully", async () => {
    const dir = mktemp();
    const { chrome, edge, metadata, storeAssets } = createArtifacts(dir, "0.1.1");
    const { fetchImpl } = buildStatefulFetch({});

    const result = await publishGitHubRelease({
      kind: "official",
      repository: REPO,
      appSlug: APP_SLUG,
      expectedSha: FAKE_SHA,
      base: "0.1",
      full: "0.1.1",
      chromeArchive: chrome,
      edgeArchive: edge,
      metadataPath: metadata,
      storeAssetsDirectory: storeAssets,
      token: TOKEN,
      policyToken: POLICY_TOKEN,
      fetchImpl,
    });

    assert.equal(result.claimed, true);
    assert.equal(result.stale, false);
    assert.equal(result.published_now, true);
    assert.equal(result.recovered_immutable, false);

    await rm(dir, { recursive: true });
  });

  it("returns stale when a higher official release exists", async () => {
    const dir = mktemp();
    const { chrome, edge, metadata, storeAssets } = createArtifacts(dir, "0.1.1");
    const { fetchImpl } = buildStatefulFetch({
      officialReleases: [{ base: "0.2", full: "0.2.1", sha: FAKE_SHA2 }],
    });

    const result = await publishGitHubRelease({
      kind: "official",
      repository: REPO,
      appSlug: APP_SLUG,
      expectedSha: FAKE_SHA,
      base: "0.1",
      full: "0.1.1",
      chromeArchive: chrome,
      edgeArchive: edge,
      metadataPath: metadata,
      storeAssetsDirectory: storeAssets,
      token: TOKEN,
      policyToken: POLICY_TOKEN,
      fetchImpl,
    });

    assert.equal(result.stale, true);
    assert.equal(result.claimed, false);
    assert.equal(result.published_now, false);

    await rm(dir, { recursive: true });
  });
});

describe("publishGitHubRelease — official release recovery", () => {
  it("returns claimed=false for lost claim (different full)", async () => {
    const dir = mktemp();
    const { chrome, edge, metadata, storeAssets } = createArtifacts(dir, "0.1.1");
    const { fetchImpl } = buildStatefulFetch({
      existingOfficialTag: { full: "0.1.99", sha: FAKE_SHA2 },
    });

    const result = await publishGitHubRelease({
      kind: "official",
      repository: REPO,
      appSlug: APP_SLUG,
      expectedSha: FAKE_SHA,
      base: "0.1",
      full: "0.1.1",
      chromeArchive: chrome,
      edgeArchive: edge,
      metadataPath: metadata,
      storeAssetsDirectory: storeAssets,
      token: TOKEN,
      policyToken: POLICY_TOKEN,
      fetchImpl,
    });

    assert.equal(result.claimed, false);
    assert.equal(result.stale, false);
    assert.equal(result.published_now, false);

    await rm(dir, { recursive: true });
  });

  it("recovers exact previously published immutable release", async () => {
    const dir = mktemp();
    const { chrome, edge, metadata, storeAssets } = createArtifacts(dir, "0.1.1");
    const { fetchImpl } = buildStatefulFetch({
      existingOfficialTag: { full: "0.1.1", sha: FAKE_SHA },
      officialReleases: [{ base: "0.1", full: "0.1.1", sha: FAKE_SHA }],
    });

    const result = await publishGitHubRelease({
      kind: "official",
      repository: REPO,
      appSlug: APP_SLUG,
      expectedSha: FAKE_SHA,
      base: "0.1",
      full: "0.1.1",
      chromeArchive: chrome,
      edgeArchive: edge,
      metadataPath: metadata,
      storeAssetsDirectory: storeAssets,
      token: TOKEN,
      policyToken: POLICY_TOKEN,
      fetchImpl,
    });

    assert.equal(result.recovered_immutable, true);
    assert.equal(result.published_now, false);

    await rm(dir, { recursive: true });
  });
});

describe("publishGitHubRelease — policy failures", () => {
  it("rejects when immutable release policy is disabled", async () => {
    const dir = mktemp();
    const { chrome, edge, metadata } = createArtifacts(dir, "0.1.1");
    const { fetchImpl } = buildStatefulFetch({ immutablePolicyEnabled: false });

    await assert.rejects(
      () =>
        publishGitHubRelease({
          kind: "build",
          repository: REPO,
          appSlug: APP_SLUG,
          expectedSha: FAKE_SHA,
          base: "0.1",
          full: "0.1.1",
          chromeArchive: chrome,
          edgeArchive: edge,
          metadataPath: metadata,
          token: TOKEN,
          policyToken: POLICY_TOKEN,
          fetchImpl,
        }),
      /immutable release policy/i,
    );

    await rm(dir, { recursive: true });
  });

  it("rejects a mutable published official release", async () => {
    const dir = mktemp();
    const { chrome, edge, metadata, storeAssets } = createArtifacts(dir, "0.1.1");
    const { fetchImpl } = buildStatefulFetch({
      officialReleases: [{ base: "0.1", full: "0.1.1", sha: FAKE_SHA }],
      mutableOfficialRelease: true,
    });

    await assert.rejects(
      () =>
        publishGitHubRelease({
          kind: "official",
          repository: REPO,
          appSlug: APP_SLUG,
          expectedSha: FAKE_SHA,
          base: "0.1",
          full: "0.1.1",
          chromeArchive: chrome,
          edgeArchive: edge,
          metadataPath: metadata,
          storeAssetsDirectory: storeAssets,
          token: TOKEN,
          policyToken: POLICY_TOKEN,
          fetchImpl,
        }),
      /mutable/i,
    );

    await rm(dir, { recursive: true });
  });
});

describe("assertCurrentOfficial", () => {
  it("passes when the base is the current maximum official", async () => {
    const { fetchImpl } = buildStatefulFetch({
      officialReleases: [{ base: "0.1", full: "0.1.1", sha: FAKE_SHA }],
    });

    await assert.doesNotReject(() =>
      assertCurrentOfficial({
        repository: REPO,
        base: "0.1",
        token: TOKEN,
        fetchImpl,
      }),
    );
  });

  it("fails when the base does not exist", async () => {
    const { fetchImpl } = buildStatefulFetch({ officialReleases: [] });

    await assert.rejects(
      () =>
        assertCurrentOfficial({
          repository: REPO,
          base: "0.1",
          token: TOKEN,
          fetchImpl,
        }),
      /does not exist/,
    );
  });

  it("fails when a higher official release exists", async () => {
    const { fetchImpl } = buildStatefulFetch({
      officialReleases: [
        { base: "0.1", full: "0.1.1", sha: FAKE_SHA },
        { base: "0.2", full: "0.2.1", sha: FAKE_SHA2 },
      ],
    });

    await assert.rejects(
      () =>
        assertCurrentOfficial({
          repository: REPO,
          base: "0.1",
          token: TOKEN,
          fetchImpl,
        }),
      /stale/i,
    );
  });
});
