import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import yaml from "yaml";

import { validateWorkflowFiles } from "./validate-workflows.mjs";

// Use the committed CI workflow — no CI fixture code lives in this file.
const ciYaml = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

// Compact canonical Release fixture.
// Permissions are listed contents-first (distinct from validate-workflows.test.mjs fixture).
// Concurrency uses YAML flow style so the block is a single line per job.
const canonicalReleaseYaml = `
name: Release
on: push
jobs:
  validate_release:
    runs-on: ubuntu-24.04
    concurrency: {group: awesomeado-release-publication, queue: max}
    permissions:
      contents: read
      attestations: read
      actions: read
    steps:
      - name: Resolve release context
        id: release_context
        run: echo context
  publish_stores:
    needs: validate_release
    runs-on: ubuntu-24.04
    concurrency: {group: awesomeado-release-publication, queue: max}
    environment: browser-extension-stores
    permissions:
      contents: read
      attestations: read
      actions: read
    steps:
      - run: echo publish
`;

/**
 * Run validateWorkflowFiles with the committed CI and a supplied release text.
 * @param {string} releaseText
 */
function runWithRelease(releaseText) {
  return validateWorkflowFiles({
    exists: () => true,
    readText: (p) => (p.includes("ci.yml") ? ciYaml : releaseText),
  });
}

/**
 * Parse the canonical fixture, apply a mutation, then re-serialise to YAML.
 * @param {(doc: any) => void} mutateFn
 * @returns {string}
 */
function mutate(mutateFn) {
  const doc = yaml.parse(canonicalReleaseYaml);
  mutateFn(doc);
  return yaml.stringify(doc);
}

// ─── Canonical passing test ───────────────────────────────────────────────────

describe("validateWorkflowFiles — Release canonical fixture", () => {
  it("accepts the canonical Release workflow without error", () => {
    const result = runWithRelease(canonicalReleaseYaml);
    assert.ok("validated" in result);
  });
});

// ─── Job presence ─────────────────────────────────────────────────────────────

describe("validateWorkflowFiles — Release job presence", () => {
  it("rejects a Release that is missing the publish_stores job", () => {
    const mutated = mutate((doc) => {
      delete doc.jobs.publish_stores;
    });
    assert.throws(() => runWithRelease(mutated), /exactly jobs/i);
  });

  it("rejects a Release that is missing the validate_release job", () => {
    const mutated = mutate((doc) => {
      delete doc.jobs.validate_release;
    });
    assert.throws(() => runWithRelease(mutated), /exactly jobs/i);
  });
});

// ─── Concurrency policy ───────────────────────────────────────────────────────

describe("validateWorkflowFiles — Release concurrency policy", () => {
  it("rejects workflow-level concurrency on Release", () => {
    const mutated = mutate((doc) => {
      doc.concurrency = { group: "disallowed", "cancel-in-progress": true };
    });
    assert.throws(() => runWithRelease(mutated), /workflow-level concurrency/i);
  });

  it("rejects missing job-level concurrency on validate_release", () => {
    const mutated = mutate((doc) => {
      delete doc.jobs.validate_release.concurrency;
    });
    assert.throws(() => runWithRelease(mutated), /awesomeado-release-publication/i);
  });

  it("rejects missing job-level concurrency on publish_stores", () => {
    const mutated = mutate((doc) => {
      delete doc.jobs.publish_stores.concurrency;
    });
    assert.throws(() => runWithRelease(mutated), /awesomeado-release-publication/i);
  });
});

// ─── Runner policy ────────────────────────────────────────────────────────────

describe("validateWorkflowFiles — Release runner policy", () => {
  it("rejects an unapproved runner on validate_release", () => {
    const mutated = mutate((doc) => {
      doc.jobs.validate_release["runs-on"] = "ubuntu-22.04";
    });
    assert.throws(() => runWithRelease(mutated), /literal scalar runner/i);
  });

  it("rejects an unapproved runner on publish_stores", () => {
    const mutated = mutate((doc) => {
      doc.jobs.publish_stores["runs-on"] = "ubuntu-22.04";
    });
    assert.throws(() => runWithRelease(mutated), /literal scalar runner/i);
  });
});

// ─── Permissions ──────────────────────────────────────────────────────────────

describe("validateWorkflowFiles — Release permissions", () => {
  it("rejects extra permissions on validate_release", () => {
    const mutated = mutate((doc) => {
      doc.jobs.validate_release.permissions["id-token"] = "write";
    });
    assert.throws(() => runWithRelease(mutated), /exactly.*actions.*attestations.*contents/i);
  });

  it("rejects extra permissions on publish_stores", () => {
    const mutated = mutate((doc) => {
      doc.jobs.publish_stores.permissions["id-token"] = "write";
    });
    assert.throws(() => runWithRelease(mutated), /exactly.*actions.*attestations.*contents/i);
  });
});

// ─── publish_stores environment ───────────────────────────────────────────────

describe("validateWorkflowFiles — Release publish_stores environment", () => {
  it("rejects publish_stores without the required environment declaration", () => {
    const mutated = mutate((doc) => {
      delete doc.jobs.publish_stores.environment;
    });
    assert.throws(() => runWithRelease(mutated), /environment.*browser-extension-stores/i);
  });

  it("rejects publish_stores with a wrong environment name", () => {
    const mutated = mutate((doc) => {
      doc.jobs.publish_stores.environment = "wrong-env";
    });
    assert.throws(() => runWithRelease(mutated), /environment.*browser-extension-stores/i);
  });
});

// ─── Forbidden commands ───────────────────────────────────────────────────────

describe("validateWorkflowFiles — Release forbidden commands", () => {
  it("rejects pnpm build anywhere in Release", () => {
    const mutated = mutate((doc) => {
      doc.jobs.validate_release.steps.push({ run: "pnpm build" });
    });
    assert.throws(() => runWithRelease(mutated), /build or package/i);
  });

  it("rejects pnpm package anywhere in Release", () => {
    const mutated = mutate((doc) => {
      doc.jobs.publish_stores.steps.push({ run: "pnpm package" });
    });
    assert.throws(() => runWithRelease(mutated), /build or package/i);
  });
});

// ─── validate_release step requirements ──────────────────────────────────────

describe("validateWorkflowFiles — Release validate_release step requirements", () => {
  it("rejects validate_release without a release_context step id", () => {
    const mutated = mutate((doc) => {
      doc.jobs.validate_release.steps[0].id = "wrong_id";
    });
    assert.throws(() => runWithRelease(mutated), /release_context/i);
  });

  it("rejects validate_release that contains a release-tag git checkout", () => {
    const mutated = mutate((doc) => {
      doc.jobs.validate_release.steps.push({ run: "git checkout v1.0" });
    });
    assert.throws(() => runWithRelease(mutated), /release tag/i);
  });
});
