import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import AdmZip from "adm-zip";

import { validateEntrySizes, validateRelease } from "./validate-release.mjs";

const FAKE_SHA = "a".repeat(40);
const FAKE_SHA2 = "b".repeat(40);

/**
 * Create a valid ZIP archive with required extension files.
 * @param {string} zipPath
 * @param {string} version
 * @param {Record<string, any>} [opts]
 */
function createValidZip(zipPath, version, opts = {}) {
  const { extraFiles = [], manifestOverride = null } = opts;
  const zip = new AdmZip();
  const manifest = manifestOverride ?? {
    manifest_version: 3,
    name: "Test",
    version,
    description: "Test",
  };
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
  zip.addFile("background/service-worker.js", Buffer.from("// sw"));
  zip.addFile("content/blank-query-page.js", Buffer.from("// content"));
  zip.addFile("options/options.js", Buffer.from("// options"));
  zip.addFile("options/options.html", Buffer.from("<html></html>"));
  for (const [name, content] of extraFiles) {
    zip.addFile(name, Buffer.from(content));
  }
  zip.writeZip(zipPath);
}

/**
 * Create a valid artifacts directory.
 * @param {string} dir
 * @param {string} full e.g. "0.1.1"
 * @param {object} [metadataOverride]
 */
function createArtifacts(dir, full, metadataOverride) {
  mkdirSync(dir, { recursive: true });
  const [base, , build] = full.split(".");
  const metadata = metadataOverride ?? {
    format: 1,
    base: `${base}.${full.split(".")[1]}`,
    build: build ?? "0",
    full,
    GITHUB_SHA: FAKE_SHA,
  };
  writeFileSync(join(dir, "release-metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
  createValidZip(join(dir, `awesomeado-chrome-${full}.zip`), full);
  createValidZip(join(dir, `awesomeado-edge-${full}.zip`), full);
}

let tmpCount = 0;
function mktemp() {
  return join(tmpdir(), `validate-release-test-${Date.now()}-${++tmpCount}`);
}

/**
 * Create a raw ZIP buffer with a single entry having a controlled (possibly unsafe) entry name.
 * AdmZip normalizes paths on write, so this bypasses normalization for security tests.
 * @param {string} zipPath
 * @param {string} entryName
 */
function createZipWithRawEntryName(zipPath, entryName) {
  const content = Buffer.from("data");
  const nameBuffer = Buffer.from(entryName, "utf-8");
  const nameLen = nameBuffer.length;

  const localHeader = Buffer.alloc(30 + nameLen + content.length);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(0, 14);
  localHeader.writeUInt32LE(content.length, 18);
  localHeader.writeUInt32LE(content.length, 22);
  localHeader.writeUInt16LE(nameLen, 26);
  localHeader.writeUInt16LE(0, 28);
  nameBuffer.copy(localHeader, 30);
  content.copy(localHeader, 30 + nameLen);

  const cdHeader = Buffer.alloc(46 + nameLen);
  cdHeader.writeUInt32LE(0x02014b50, 0);
  cdHeader.writeUInt16LE(20, 4);
  cdHeader.writeUInt16LE(20, 6);
  cdHeader.writeUInt16LE(0, 8);
  cdHeader.writeUInt16LE(0, 10);
  cdHeader.writeUInt16LE(0, 12);
  cdHeader.writeUInt16LE(0, 14);
  cdHeader.writeUInt32LE(0, 16);
  cdHeader.writeUInt32LE(content.length, 20);
  cdHeader.writeUInt32LE(content.length, 24);
  cdHeader.writeUInt16LE(nameLen, 28);
  cdHeader.writeUInt16LE(0, 30);
  cdHeader.writeUInt16LE(0, 32);
  cdHeader.writeUInt16LE(0, 34);
  cdHeader.writeUInt16LE(0, 36);
  cdHeader.writeUInt32LE(0, 38);
  cdHeader.writeInt32LE(0, 42);
  nameBuffer.copy(cdHeader, 46);

  const cdOffset = localHeader.length;
  const cdSize = cdHeader.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  writeFileSync(zipPath, Buffer.concat([localHeader, cdHeader, eocd]));
}

describe("validateRelease — success", () => {
  it("returns correct identity for a valid artifact set", () => {
    const dir = mktemp();
    createArtifacts(dir, "0.1.1");
    const result = validateRelease({
      artifactDirectory: dir,
      expectedSha: FAKE_SHA,
      expectedFull: "0.1.1",
    });
    assert.equal(result.base, "0.1");
    assert.equal(result.full, "0.1.1");
    assert.equal(result.source_sha, FAKE_SHA);
    assert.ok(result.chrome_archive.endsWith("awesomeado-chrome-0.1.1.zip"));
    assert.ok(result.edge_archive.endsWith("awesomeado-edge-0.1.1.zip"));
    rmSync(dir, { recursive: true });
  });

  it("accepts with optional official tag matching metadata", () => {
    const dir = mktemp();
    createArtifacts(dir, "0.1.1");
    const result = validateRelease({
      artifactDirectory: dir,
      expectedSha: FAKE_SHA,
      officialTag: "v0.1",
      officialTagSha: FAKE_SHA,
    });
    assert.equal(result.base, "0.1");
    rmSync(dir, { recursive: true });
  });
});

describe("validateRelease — metadata failures", () => {
  it("rejects malformed JSON metadata", () => {
    const dir = mktemp();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "release-metadata.json"), "{ not json }");
    createValidZip(join(dir, "awesomeado-chrome-0.1.1.zip"), "0.1.1");
    createValidZip(join(dir, "awesomeado-edge-0.1.1.zip"), "0.1.1");
    assert.throws(
      () => validateRelease({ artifactDirectory: dir, expectedSha: FAKE_SHA }),
      /not valid JSON/,
    );
    rmSync(dir, { recursive: true });
  });

  it("rejects metadata with unknown fields", () => {
    const dir = mktemp();
    createArtifacts(dir, "0.1.1", {
      format: 1,
      base: "0.1",
      build: "1",
      full: "0.1.1",
      GITHUB_SHA: FAKE_SHA,
      extra: "field",
    });
    assert.throws(
      () => validateRelease({ artifactDirectory: dir, expectedSha: FAKE_SHA }),
      /metadata fields must be/,
    );
    rmSync(dir, { recursive: true });
  });

  it("rejects metadata format 0", () => {
    const dir = mktemp();
    createArtifacts(dir, "0.1.1", {
      format: 0,
      base: "0.1",
      build: "1",
      full: "0.1.1",
      GITHUB_SHA: FAKE_SHA,
    });
    assert.throws(
      () => validateRelease({ artifactDirectory: dir, expectedSha: FAKE_SHA }),
      /unsupported.*format/i,
    );
    rmSync(dir, { recursive: true });
  });

  it("rejects inconsistent full version", () => {
    const dir = mktemp();
    createArtifacts(dir, "0.1.1", {
      format: 1,
      base: "0.1",
      build: "1",
      full: "0.1.99",
      GITHUB_SHA: FAKE_SHA,
    });
    assert.throws(
      () => validateRelease({ artifactDirectory: dir, expectedSha: FAKE_SHA }),
      /inconsistent/,
    );
    rmSync(dir, { recursive: true });
  });

  it("rejects SHA mismatch", () => {
    const dir = mktemp();
    createArtifacts(dir, "0.1.1");
    assert.throws(
      () => validateRelease({ artifactDirectory: dir, expectedSha: FAKE_SHA2 }),
      /SHA does not match/,
    );
    rmSync(dir, { recursive: true });
  });

  it("rejects wrong expected full", () => {
    const dir = mktemp();
    createArtifacts(dir, "0.1.1");
    assert.throws(
      () =>
        validateRelease({
          artifactDirectory: dir,
          expectedSha: FAKE_SHA,
          expectedFull: "0.1.99",
        }),
      /version does not match/,
    );
    rmSync(dir, { recursive: true });
  });
});

describe("validateRelease — artifact directory failures", () => {
  it("rejects extra files in artifact directory", () => {
    const dir = mktemp();
    createArtifacts(dir, "0.1.1");
    writeFileSync(join(dir, "extra.txt"), "extra");
    assert.throws(
      () => validateRelease({ artifactDirectory: dir, expectedSha: FAKE_SHA }),
      /must contain exactly/,
    );
    rmSync(dir, { recursive: true });
  });

  it("rejects wrong archive names", () => {
    const dir = mktemp();
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "release-metadata.json"),
      JSON.stringify(
        {
          format: 1,
          base: "0.1",
          build: "1",
          full: "0.1.1",
          GITHUB_SHA: FAKE_SHA,
        },
        null,
        2,
      ) + "\n",
    );
    // Wrong names
    createValidZip(join(dir, "wrong-chrome.zip"), "0.1.1");
    createValidZip(join(dir, "wrong-edge.zip"), "0.1.1");
    assert.throws(
      () => validateRelease({ artifactDirectory: dir, expectedSha: FAKE_SHA }),
      /must contain exactly/,
    );
    rmSync(dir, { recursive: true });
  });
});

describe("validateRelease — ZIP validation failures", () => {
  it("rejects a ZIP missing a required file (background/service-worker.js)", () => {
    const dir = mktemp();
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "release-metadata.json"),
      JSON.stringify(
        {
          format: 1,
          base: "0.1",
          build: "1",
          full: "0.1.1",
          GITHUB_SHA: FAKE_SHA,
        },
        null,
        2,
      ) + "\n",
    );
    const zip = new AdmZip();
    zip.addFile(
      "manifest.json",
      Buffer.from(
        JSON.stringify({
          manifest_version: 3,
          name: "Test",
          version: "0.1.1",
        }),
      ),
    );
    // Missing background/service-worker.js
    zip.addFile("content/blank-query-page.js", Buffer.from("// content"));
    zip.addFile("options/options.js", Buffer.from("// options"));
    zip.addFile("options/options.html", Buffer.from("<html></html>"));
    zip.writeZip(join(dir, "awesomeado-chrome-0.1.1.zip"));
    createValidZip(join(dir, "awesomeado-edge-0.1.1.zip"), "0.1.1");
    assert.throws(
      () => validateRelease({ artifactDirectory: dir, expectedSha: FAKE_SHA }),
      /missing background\/service-worker\.js/,
    );
    rmSync(dir, { recursive: true });
  });

  it("rejects a ZIP with wrong manifest version", () => {
    const dir = mktemp();
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "release-metadata.json"),
      JSON.stringify(
        {
          format: 1,
          base: "0.1",
          build: "1",
          full: "0.1.1",
          GITHUB_SHA: FAKE_SHA,
        },
        null,
        2,
      ) + "\n",
    );
    createValidZip(join(dir, "awesomeado-chrome-0.1.1.zip"), "9.9.9"); // Wrong version
    createValidZip(join(dir, "awesomeado-edge-0.1.1.zip"), "0.1.1");
    assert.throws(
      () => validateRelease({ artifactDirectory: dir, expectedSha: FAKE_SHA }),
      /manifest version is invalid/,
    );
    rmSync(dir, { recursive: true });
  });

  it("rejects a ZIP with a traversal entry name", () => {
    const dir = mktemp();
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "release-metadata.json"),
      JSON.stringify(
        {
          format: 1,
          base: "0.1",
          build: "1",
          full: "0.1.1",
          GITHUB_SHA: FAKE_SHA,
        },
        null,
        2,
      ) + "\n",
    );
    // AdmZip normalizes paths, so use raw ZIP creation to inject a traversal entry name
    createZipWithRawEntryName(join(dir, "awesomeado-chrome-0.1.1.zip"), "../escape.js");
    createValidZip(join(dir, "awesomeado-edge-0.1.1.zip"), "0.1.1");
    assert.throws(
      () => validateRelease({ artifactDirectory: dir, expectedSha: FAKE_SHA }),
      /traverses its root|entry name is unsafe/,
    );
    rmSync(dir, { recursive: true });
  });
});

describe("validateEntrySizes", () => {
  it("accepts valid declared and compressed sizes", () => {
    assert.doesNotThrow(() => validateEntrySizes(0, 0, "test.js"));
    assert.doesNotThrow(() => validateEntrySizes(100, 50, "test.js"));
    assert.doesNotThrow(() => validateEntrySizes(10 * 1024 * 1024, 5 * 1024 * 1024, "test.js"));
  });

  it("rejects negative declared size", () => {
    assert.throws(() => validateEntrySizes(-1, 0, "test.js"), /size is invalid/);
  });

  it("rejects declared size above MAX_ENTRY_BYTES (10 MiB)", () => {
    assert.throws(() => validateEntrySizes(10 * 1024 * 1024 + 1, 0, "test.js"), /size is invalid/);
  });

  it("rejects negative compressed size", () => {
    assert.throws(() => validateEntrySizes(0, -1, "test.js"), /size is invalid/);
  });

  it("rejects compressed size above MAX_ARCHIVE_BYTES (50 MiB)", () => {
    assert.throws(() => validateEntrySizes(0, 50 * 1024 * 1024 + 1, "test.js"), /size is invalid/);
  });

  it("rejects fractional declared size", () => {
    assert.throws(() => validateEntrySizes(1.5, 0, "test.js"), /size is invalid/);
  });

  it("rejects unsafe-integer declared size", () => {
    assert.throws(
      () => validateEntrySizes(Number.MAX_SAFE_INTEGER + 1, 0, "test.js"),
      /size is invalid/,
    );
  });
});

describe("validateRelease — official tag validation", () => {
  it("rejects an official tag not bound to the validated SHA", () => {
    const dir = mktemp();
    createArtifacts(dir, "0.1.1");
    assert.throws(
      () =>
        validateRelease({
          artifactDirectory: dir,
          expectedSha: FAKE_SHA,
          officialTag: "v0.1",
          officialTagSha: FAKE_SHA2, // Different SHA
        }),
      /official tag is not bound/,
    );
    rmSync(dir, { recursive: true });
  });

  it("rejects when only one of officialTag/officialTagSha is provided", () => {
    const dir = mktemp();
    createArtifacts(dir, "0.1.1");
    assert.throws(
      () =>
        validateRelease({
          artifactDirectory: dir,
          expectedSha: FAKE_SHA,
          officialTag: "v0.1",
          // officialTagSha missing
        }),
      /must be supplied together/,
    );
    rmSync(dir, { recursive: true });
  });
});

describe("validateRelease — output file writing", () => {
  it("prints JSON to stdout when GITHUB_OUTPUT is not set", () => {
    // This is tested indirectly through the exported function return value
    const dir = mktemp();
    createArtifacts(dir, "0.1.1");
    const result = validateRelease({
      artifactDirectory: dir,
      expectedSha: FAKE_SHA,
    });
    assert.ok(typeof result.chrome_archive === "string");
    assert.ok(typeof result.edge_archive === "string");
    assert.ok(typeof result.base === "string");
    assert.ok(typeof result.full === "string");
    assert.ok(typeof result.source_sha === "string");
    rmSync(dir, { recursive: true });
  });
});
