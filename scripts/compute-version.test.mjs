import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { computeVersion, emitResult } from "./compute-version.mjs";

// These cases exercise pure version/changelog logic, not the CI-only guard that requires
// RELEASE_SHA. CI — and `test:scripts` locally — sets GITHUB_ACTIONS=true, so without this
// reset the ambient flag would leak into computeVersion's env-derived defaults and make
// identical tests pass locally yet fail in the cloud. Clearing the CI-derived variables keeps
// every case deterministic regardless of where the suite runs; the guard is covered explicitly
// by the cases that pass isGithubActions/releaseSha themselves.
delete process.env.GITHUB_ACTIONS;
delete process.env.RELEASE_SHA;
delete process.env.BUILD_NUMBER;

const basePkg = { version: "0.1.0", versionBuildOffset: 0 };
const validChangelog = `# Changelog\n\n## 0.1\n\n- Initial release.\n`;
const changelogWithNext = `# Changelog\n\n## Next Version\n\n- Coming soon.\n\n## 0.1\n\n- Initial release.\n`;
const changelogNoSection = `# Changelog\n\n## Next Version\n\n- Coming soon.\n`;
const changelogNoBullet = `# Changelog\n\n## 0.1\n\n## 0.0\n\n- Old.\n`;
const changelogDuplicate = `# Changelog\n\n## 0.1\n\n- First.\n\n## 0.1\n\n- Duplicate.\n`;
const changelogGrouped = `# Changelog\n\n## 0.1\n\n### New Features\n\n- **WIP** — A capability.\n\n### Bug Fixes\n\n- A fix.\n`;

describe("computeVersion — tag absent", () => {
  it("returns is_new_official=true when tag does not exist", () => {
    const result = computeVersion({
      packageMetadata: basePkg,
      changelogText: validChangelog,
      tagExists: () => ({ exists: false }),
    });
    assert.equal(result.is_new_official, true);
    assert.equal(result.should_release_official, true);
    assert.equal(result.base, "0.1");
    assert.equal(result.full, "0.1.0");
  });

  it("returns is_new_official=false when tag already exists", () => {
    const result = computeVersion({
      packageMetadata: basePkg,
      changelogText: validChangelog,
      tagExists: () => ({ exists: true }),
    });
    assert.equal(result.is_new_official, false);
    assert.equal(result.should_release_official, true);
  });

  it("still sets should_release_official=true for an existing annotated tag", () => {
    const result = computeVersion({
      packageMetadata: basePkg,
      changelogText: validChangelog,
      tagExists: () => ({ exists: true }),
    });
    assert.equal(result.should_release_official, true);
  });
});

describe("computeVersion — GitHub Actions RELEASE_SHA", () => {
  it("requires lowercase 40-hex RELEASE_SHA in GitHub Actions", () => {
    assert.throws(
      () =>
        computeVersion({
          packageMetadata: basePkg,
          changelogText: validChangelog,
          tagExists: () => ({ exists: false }),
          isGithubActions: true,
          releaseSha: "UPPERCASE1234567890123456789012345678",
        }),
      /RELEASE_SHA must be a lowercase 40-hex/,
    );
  });

  it("accepts a valid lowercase 40-hex RELEASE_SHA in GitHub Actions", () => {
    const result = computeVersion({
      packageMetadata: basePkg,
      changelogText: validChangelog,
      tagExists: () => ({ exists: false }),
      isGithubActions: true,
      releaseSha: "a".repeat(40),
    });
    assert.equal(result.base, "0.1");
  });

  it("does not require RELEASE_SHA outside GitHub Actions", () => {
    const result = computeVersion({
      packageMetadata: basePkg,
      changelogText: validChangelog,
      tagExists: () => ({ exists: false }),
      isGithubActions: false,
      releaseSha: undefined,
    });
    assert.equal(result.base, "0.1");
  });
});

describe("computeVersion — changelog parsing", () => {
  it("throws when changelog section is missing", () => {
    assert.throws(
      () =>
        computeVersion({
          packageMetadata: basePkg,
          changelogText: changelogNoSection,
          tagExists: () => ({ exists: false }),
        }),
      /missing.*## 0\.1/i,
    );
  });

  it("throws when changelog section has no bullet", () => {
    assert.throws(
      () =>
        computeVersion({
          packageMetadata: basePkg,
          changelogText: changelogNoBullet,
          tagExists: () => ({ exists: false }),
        }),
      /no release bullet/i,
    );
  });

  it("throws when changelog section is duplicated", () => {
    assert.throws(
      () =>
        computeVersion({
          packageMetadata: basePkg,
          changelogText: changelogDuplicate,
          tagExists: () => ({ exists: false }),
        }),
      /duplicate/i,
    );
  });

  it("accepts a changelog with a Next Version section before the target", () => {
    const result = computeVersion({
      packageMetadata: basePkg,
      changelogText: changelogWithNext,
      tagExists: () => ({ exists: false }),
    });
    assert.equal(result.base, "0.1");
  });

  // Group headings must stay H3: an H2 group would end the version section it belongs to.
  it("accepts bullets under New Features / Bug Fixes group headings", () => {
    const result = computeVersion({
      packageMetadata: basePkg,
      changelogText: changelogGrouped,
      tagExists: () => ({ exists: false }),
    });
    assert.equal(result.base, "0.1");
  });
});

describe("computeVersion — changelog fenced-code handling", () => {
  it("ignores H2 headings inside a backtick fence", () => {
    const changelog = `# Changelog\n\n\`\`\`\n## 0.1\n- fake\n\`\`\`\n\n## 0.1\n\n- Real bullet.\n`;
    const result = computeVersion({
      packageMetadata: basePkg,
      changelogText: changelog,
      tagExists: () => ({ exists: false }),
    });
    assert.equal(result.base, "0.1");
  });

  it("ignores H2 headings inside a tilde fence", () => {
    const changelog = `# Changelog\n\n~~~\n## 0.1\n- fake\n~~~\n\n## 0.1\n\n- Real bullet.\n`;
    const result = computeVersion({
      packageMetadata: basePkg,
      changelogText: changelog,
      tagExists: () => ({ exists: false }),
    });
    assert.equal(result.base, "0.1");
  });

  it("handles longer fence delimiters (4+ backticks)", () => {
    const changelog = `# Changelog\n\n\`\`\`\`\n## 0.1\n- fake\n\`\`\`\`\n\n## 0.1\n\n- Real.\n`;
    const result = computeVersion({
      packageMetadata: basePkg,
      changelogText: changelog,
      tagExists: () => ({ exists: false }),
    });
    assert.equal(result.base, "0.1");
  });

  it("handles unclosed fence (ignores to EOF, cannot manufacture a release section)", () => {
    // Unclosed fence means everything after the fence opener is fenced and ignored
    const changelog = `# Changelog\n\n\`\`\`\n## 0.1\n- fake bullet\n\n## 0.1\n\n- Real.\n`;
    assert.throws(
      () =>
        computeVersion({
          packageMetadata: basePkg,
          changelogText: changelog,
          tagExists: () => ({ exists: false }),
        }),
      /missing.*## 0\.1/i,
    );
  });

  it("handles a multiline real bullet (subsequent lines are not extra bullets)", () => {
    const changelog = `# Changelog\n\n## 0.1\n\n- Line 1 of bullet\n  continuation line\n- Second bullet\n`;
    const result = computeVersion({
      packageMetadata: basePkg,
      changelogText: changelog,
      tagExists: () => ({ exists: false }),
    });
    assert.equal(result.base, "0.1");
  });
});

describe("computeVersion — Git failure", () => {
  it("throws when Git cannot run", () => {
    assert.throws(
      () =>
        computeVersion({
          packageMetadata: basePkg,
          changelogText: validChangelog,
          tagExists: () => ({ error: "Git process error: ENOENT" }),
        }),
      /Git process error/,
    );
  });

  it("throws when Git exits with unexpected status", () => {
    assert.throws(
      () =>
        computeVersion({
          packageMetadata: basePkg,
          changelogText: validChangelog,
          tagExists: () => ({ error: "Git exited with unexpected status 2" }),
        }),
      /unexpected status/,
    );
  });
});

describe("emitResult — output file writing", () => {
  const RESULT = {
    base: "0.1",
    build: "5",
    full: "0.1.5",
    is_new_official: true,
    should_release_official: true,
  };
  const EXPECTED_LINES = [
    "base=0.1",
    "build=5",
    "full=0.1.5",
    "is_new_official=true",
    "should_release_official=true",
  ];

  /**
   * Run `body` with GITHUB_OUTPUT set as given, restoring whatever the environment had.
   * @param {string | undefined} value
   * @param {() => void} body
   */
  function withGithubOutput(value, body) {
    const original = process.env.GITHUB_OUTPUT;
    try {
      if (value === undefined) delete process.env.GITHUB_OUTPUT;
      else process.env.GITHUB_OUTPUT = value;
      body();
    } finally {
      if (original !== undefined) process.env.GITHUB_OUTPUT = original;
      else delete process.env.GITHUB_OUTPUT;
    }
  }

  it("appends every key=value line to GITHUB_OUTPUT when set", () => {
    const outputFile = join(tmpdir(), `github_output_${Date.now()}.txt`);
    writeFileSync(outputFile, "");

    withGithubOutput(outputFile, () => emitResult(RESULT));

    assert.equal(readFileSync(outputFile, "utf8"), EXPECTED_LINES.join("\n") + "\n");
    rmSync(outputFile, { force: true });
  });

  it("appends rather than truncates, so an earlier step's outputs survive", () => {
    const outputFile = join(tmpdir(), `github_output_append_${Date.now()}.txt`);
    writeFileSync(outputFile, "earlier=kept\n");

    withGithubOutput(outputFile, () => emitResult(RESULT));

    const written = readFileSync(outputFile, "utf8");
    assert.equal(written, "earlier=kept\n" + EXPECTED_LINES.join("\n") + "\n");
    rmSync(outputFile, { force: true });
  });

  it("falls back to stdout when GITHUB_OUTPUT is not set, so a local run still reports", () => {
    /** @type {string[]} */
    const written = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      written.push(String(chunk));
      return true;
    };
    try {
      withGithubOutput(undefined, () => emitResult(RESULT));
    } finally {
      process.stdout.write = originalWrite;
    }

    assert.deepEqual(
      written,
      EXPECTED_LINES.map((line) => line + "\n"),
    );
  });
});
