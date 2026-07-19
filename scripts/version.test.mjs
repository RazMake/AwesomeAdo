import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_VERSION_PART, createVersion } from "./version.mjs";

const basePkg = { version: "0.1.0", versionBuildOffset: 0 };

describe("createVersion", () => {
  it("returns base, build, and full for a normal version", () => {
    const result = createVersion(basePkg, "5");
    assert.equal(result.base, "0.1");
    assert.equal(result.build, "5");
    assert.equal(result.full, "0.1.5");
  });

  it("returns build 0 when no CI number is supplied (uses offset as counter)", () => {
    const result = createVersion(basePkg, undefined);
    assert.equal(result.build, "0");
    assert.equal(result.full, "0.1.0");
  });

  it("subtracts the offset from the CI build number", () => {
    const pkg = { version: "1.2.0", versionBuildOffset: 10 };
    const result = createVersion(pkg, "15");
    assert.equal(result.base, "1.2");
    assert.equal(result.build, "5");
    assert.equal(result.full, "1.2.5");
  });

  it("normalizes leading zeros in package version (major/minor parsed as integers)", () => {
    const pkg = { version: "1.2.0", versionBuildOffset: 0 };
    const result = createVersion(pkg, "1");
    assert.equal(result.base, "1.2");
  });

  it("throws for a malformed package version", () => {
    assert.throws(
      () => createVersion({ version: "1.2", versionBuildOffset: 0 }, "1"),
      /package\.json version must be Major\.Minor\.Patch/,
    );
  });

  it("throws for a negative counter (build below offset)", () => {
    const pkg = { version: "0.1.0", versionBuildOffset: 10 };
    assert.throws(() => createVersion(pkg, "5"), /effective build must be between 0/);
  });

  it("throws when the CI build number equals the offset (build = 0 is valid, but below is not)", () => {
    const pkg = { version: "0.1.0", versionBuildOffset: 5 };
    const result = createVersion(pkg, "5");
    assert.equal(result.build, "0");
  });

  it("throws when major exceeds 65535", () => {
    assert.throws(
      () => createVersion({ version: "65536.0.0", versionBuildOffset: 0 }, "0"),
      /major version part must be between 0 and 65535/,
    );
  });

  it("throws when minor exceeds 65535", () => {
    assert.throws(
      () => createVersion({ version: "0.65536.0", versionBuildOffset: 0 }, "0"),
      /minor version part must be between 0 and 65535/,
    );
  });

  it("throws when effective build exceeds 65535", () => {
    const pkg = { version: "0.1.0", versionBuildOffset: 0 };
    assert.throws(
      () => createVersion(pkg, String(MAX_VERSION_PART + 1)),
      /effective build must be between 0 and 65535/,
    );
  });

  it("allows effective build exactly 65535", () => {
    const pkg = { version: "0.1.0", versionBuildOffset: 0 };
    const result = createVersion(pkg, String(MAX_VERSION_PART));
    assert.equal(result.build, "65535");
  });

  it("throws for a non-integer CI build number", () => {
    assert.throws(
      () => createVersion(basePkg, "1.5"),
      /CI build number must be a non-negative integer/,
    );
  });

  it("throws for a negative string CI build number", () => {
    assert.throws(
      () => createVersion(basePkg, "-1"),
      /CI build number must be a non-negative integer/,
    );
  });
});
