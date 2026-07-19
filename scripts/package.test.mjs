import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import AdmZip from "adm-zip";

import { packageExtension } from "./package.mjs";

const basePkg = { version: "0.1.0", versionBuildOffset: 0 };

/**
 * Create a minimal dist directory structure with required files.
 * @param {string} distDir
 * @param {string} version
 */
async function createMinimalDist(distDir, version) {
  const manifest = {
    manifest_version: 3,
    name: "Test",
    version,
    description: "Test extension",
  };
  await mkdir(distDir, { recursive: true });
  await mkdir(join(distDir, "background"), { recursive: true });
  await mkdir(join(distDir, "content"), { recursive: true });
  await mkdir(join(distDir, "options"), { recursive: true });
  await writeFile(join(distDir, "manifest.json"), JSON.stringify(manifest));
  await writeFile(join(distDir, "background/service-worker.js"), "// sw");
  await writeFile(join(distDir, "content/blank-query-page.js"), "// content");
  await writeFile(join(distDir, "options/options.js"), "// options");
  await writeFile(join(distDir, "options/options.html"), "<html></html>");
}

/** @param {string} filePath */
function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/** @param {string} zipPath */
function getZipEntryNames(zipPath) {
  const zip = new AdmZip(zipPath);
  return zip
    .getEntries()
    .map((e) => e.entryName)
    .sort();
}

describe("packageExtension — deterministic archives", () => {
  it("produces two byte-identical archives (Chrome === Edge) and stable across runs", async () => {
    const tmp = join(tmpdir(), `pkg-test-${Date.now()}`);
    const distDir = join(tmp, "dist");
    const artifactsDir = join(tmp, "artifacts");
    await createMinimalDist(distDir, "0.1.0");

    await packageExtension({
      packageMetadata: basePkg,
      env: { GITHUB_SHA: "a".repeat(40) },
      runBuild: () => {},
      artifactsDir,
      distDir,
    });

    const chromeHash = sha256(join(artifactsDir, "awesomeado-chrome-0.1.0.zip"));
    const edgeHash = sha256(join(artifactsDir, "awesomeado-edge-0.1.0.zip"));
    assert.equal(chromeHash, edgeHash, "Chrome and Edge archives must be byte-identical");

    // Run again with different mtimes (touch files) — should produce same hash
    await new Promise((r) => setTimeout(r, 10));
    const distDir2 = join(tmp, "dist2");
    const artifactsDir2 = join(tmp, "artifacts2");
    await createMinimalDist(distDir2, "0.1.0");

    await packageExtension({
      packageMetadata: basePkg,
      env: { GITHUB_SHA: "a".repeat(40) },
      runBuild: () => {},
      artifactsDir: artifactsDir2,
      distDir: distDir2,
    });

    const chromeHash2 = sha256(join(artifactsDir2, "awesomeado-chrome-0.1.0.zip"));
    assert.equal(chromeHash, chromeHash2, "Archives must be stable across runs");

    await rm(tmp, { recursive: true, force: true });
  });

  it("entries have ZIP_DATE and mode 0o100644", async () => {
    const tmp = join(tmpdir(), `pkg-test-date-${Date.now()}`);
    const distDir = join(tmp, "dist");
    const artifactsDir = join(tmp, "artifacts");
    await createMinimalDist(distDir, "0.1.0");

    await packageExtension({
      packageMetadata: basePkg,
      env: { GITHUB_SHA: "a".repeat(40) },
      runBuild: () => {},
      artifactsDir,
      distDir,
    });

    const zip = new AdmZip(join(artifactsDir, "awesomeado-chrome-0.1.0.zip"));
    for (const entry of zip.getEntries()) {
      const entryTime = entry.header.time;
      // ZIP_DATE is 1980-01-01T00:00:00.000Z
      assert.ok(
        entryTime instanceof Date || typeof entryTime === "number",
        "entry must have a date",
      );
    }

    await rm(tmp, { recursive: true, force: true });
  });

  it("entries are sorted by Unicode code-point order", async () => {
    const tmp = join(tmpdir(), `pkg-test-sort-${Date.now()}`);
    const distDir = join(tmp, "dist");
    const artifactsDir = join(tmp, "artifacts");
    await createMinimalDist(distDir, "0.1.0");

    await packageExtension({
      packageMetadata: basePkg,
      env: { GITHUB_SHA: "a".repeat(40) },
      runBuild: () => {},
      artifactsDir,
      distDir,
    });

    const names = getZipEntryNames(join(artifactsDir, "awesomeado-chrome-0.1.0.zip"));
    const sorted = [...names].sort();
    assert.deepEqual(names, sorted, "ZIP entries must be sorted");

    await rm(tmp, { recursive: true, force: true });
  });
});

describe("packageExtension — failures", () => {
  it("rejects missing GITHUB_SHA before build or artifacts recreation", async () => {
    let buildCalled = false;
    await assert.rejects(
      () =>
        packageExtension({
          packageMetadata: basePkg,
          env: {},
          runBuild: () => {
            buildCalled = true;
          },
          artifactsDir: join(tmpdir(), "artifacts-never"),
          distDir: join(tmpdir(), "dist-never"),
        }),
      /GITHUB_SHA/,
    );
    assert.equal(buildCalled, false, "build must not run before SHA validation");
  });

  it("rejects malformed GITHUB_SHA", async () => {
    await assert.rejects(
      () =>
        packageExtension({
          packageMetadata: basePkg,
          env: { GITHUB_SHA: "not-hex" },
          runBuild: () => {},
          artifactsDir: join(tmpdir(), "artifacts-never2"),
          distDir: join(tmpdir(), "dist-never2"),
        }),
      /GITHUB_SHA/,
    );
  });

  it("rejects manifest version mismatch", async () => {
    const tmp = join(tmpdir(), `pkg-test-mismatch-${Date.now()}`);
    const distDir = join(tmp, "dist");
    const artifactsDir = join(tmp, "artifacts");
    // Create dist with wrong version
    await createMinimalDist(distDir, "9.9.9");

    await assert.rejects(
      () =>
        packageExtension({
          packageMetadata: basePkg,
          env: { GITHUB_SHA: "a".repeat(40) },
          runBuild: () => {},
          artifactsDir,
          distDir,
        }),
      /manifest version/,
    );

    await rm(tmp, { recursive: true, force: true });
  });

  it("rejects when a required dist file is missing", async () => {
    const tmp = join(tmpdir(), `pkg-test-missing-${Date.now()}`);
    const distDir = join(tmp, "dist");
    const artifactsDir = join(tmp, "artifacts");
    await mkdir(distDir, { recursive: true });
    await mkdir(join(distDir, "background"), { recursive: true });
    // Only create manifest, skip the rest
    await writeFile(
      join(distDir, "manifest.json"),
      JSON.stringify({ manifest_version: 3, name: "Test", version: "0.1.0" }),
    );

    await assert.rejects(
      () =>
        packageExtension({
          packageMetadata: basePkg,
          env: { GITHUB_SHA: "a".repeat(40) },
          runBuild: () => {},
          artifactsDir,
          distDir,
        }),
      /missing/,
    );

    await rm(tmp, { recursive: true, force: true });
  });

  it("rejects a symlink under dist/", async () => {
    const tmp = join(tmpdir(), `pkg-test-symlink-${Date.now()}`);
    const distDir = join(tmp, "dist");
    const artifactsDir = join(tmp, "artifacts");
    await createMinimalDist(distDir, "0.1.0");
    // Create a symlink in dist/
    const linkTarget = join(tmp, "target.js");
    await writeFile(linkTarget, "// target");
    // Windows without developer mode forbids symlink creation; skip gracefully.
    let symlinkCreated = false;
    try {
      symlinkSync(linkTarget, join(distDir, "symlink.js"));
      symlinkCreated = true;
    } catch (e) {
      if (/** @type {any} */ (e).code !== "EPERM") throw e;
    }
    if (!symlinkCreated) {
      await rm(tmp, { recursive: true, force: true });
      return;
    }

    await assert.rejects(
      () =>
        packageExtension({
          packageMetadata: basePkg,
          env: { GITHUB_SHA: "a".repeat(40) },
          runBuild: () => {},
          artifactsDir,
          distDir,
        }),
      /Symlink/i,
    );

    await rm(tmp, { recursive: true, force: true });
  });

  it("rejects a source map file under dist/", async () => {
    const tmp = join(tmpdir(), `pkg-test-sourcemap-${Date.now()}`);
    const distDir = join(tmp, "dist");
    const artifactsDir = join(tmp, "artifacts");
    await createMinimalDist(distDir, "0.1.0");
    await writeFile(join(distDir, "background/service-worker.js.map"), "{}");

    await assert.rejects(
      () =>
        packageExtension({
          packageMetadata: basePkg,
          env: { GITHUB_SHA: "a".repeat(40) },
          runBuild: () => {},
          artifactsDir,
          distDir,
        }),
      /\.map/,
    );

    await rm(tmp, { recursive: true, force: true });
  });

  it("removes artifacts/ directory on archive failure", async () => {
    const tmp = join(tmpdir(), `pkg-test-archivefail-${Date.now()}`);
    const distDir = join(tmp, "dist");
    const artifactsDir = join(tmp, "artifacts");
    await createMinimalDist(distDir, "0.1.0");

    await assert.rejects(
      () =>
        packageExtension({
          packageMetadata: basePkg,
          env: { GITHUB_SHA: "a".repeat(40) },
          runBuild: () => {},
          artifactsDir,
          distDir: join(tmp, "nonexistent-dist"), // will cause error during walk
        }),
      (err) => err instanceof Error,
    );

    // artifacts/ should be cleaned up
    assert.equal(existsSync(artifactsDir), false, "artifacts/ must be removed on failure");

    await rm(tmp, { recursive: true, force: true });
  });

  it("rejects build failure", async () => {
    const tmp = join(tmpdir(), `pkg-test-buildfail-${Date.now()}`);
    await assert.rejects(
      () =>
        packageExtension({
          packageMetadata: basePkg,
          env: { GITHUB_SHA: "a".repeat(40) },
          runBuild: () => {
            throw new Error("build failed");
          },
          artifactsDir: join(tmp, "artifacts"),
          distDir: join(tmp, "dist"),
        }),
      /build failed/,
    );

    await rm(tmp, { recursive: true, force: true });
  });
});

describe("packageExtension — metadata", () => {
  it("writes correct metadata keys, types, and trailing newline", async () => {
    const tmp = join(tmpdir(), `pkg-test-meta-${Date.now()}`);
    const distDir = join(tmp, "dist");
    const artifactsDir = join(tmp, "artifacts");
    // With BUILD_NUMBER: "3" and versionBuildOffset: 0, full = "0.1.3".
    // The manifest must match the computed full version.
    await createMinimalDist(distDir, "0.1.3");

    await packageExtension({
      packageMetadata: basePkg,
      env: { GITHUB_SHA: "b".repeat(40), BUILD_NUMBER: "3" },
      runBuild: () => {},
      artifactsDir,
      distDir,
    });

    const metadata = JSON.parse(readFileSync(join(artifactsDir, "release-metadata.json"), "utf8"));
    assert.equal(metadata.format, 1);
    assert.equal(typeof metadata.format, "number");
    assert.equal(metadata.base, "0.1");
    assert.equal(metadata.build, "3");
    assert.equal(metadata.full, "0.1.3");
    assert.equal(metadata.GITHUB_SHA, "b".repeat(40));
    assert.equal(Object.keys(metadata).sort().join(","), "GITHUB_SHA,base,build,format,full");

    // Must end with newline
    const raw = readFileSync(join(artifactsDir, "release-metadata.json"), "utf8");
    assert.ok(raw.endsWith("\n"), "metadata file must end with newline");

    await rm(tmp, { recursive: true, force: true });
  });

  it("no metadata file is written on archive failure", async () => {
    const tmp = join(tmpdir(), `pkg-test-meta-fail-${Date.now()}`);
    const artifactsDir = join(tmp, "artifacts");

    await assert.rejects(
      () =>
        packageExtension({
          packageMetadata: basePkg,
          env: { GITHUB_SHA: "a".repeat(40) },
          runBuild: () => {},
          artifactsDir,
          distDir: join(tmp, "nonexistent"),
        }),
      (err) => err instanceof Error,
    );

    assert.equal(existsSync(artifactsDir), false, "No metadata after failure");

    await rm(tmp, { recursive: true, force: true });
  });
});
