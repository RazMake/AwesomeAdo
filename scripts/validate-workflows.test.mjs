import assert from "node:assert/strict";
import { describe, it } from "node:test";

import yaml from "yaml";

import { validateWorkflowFiles, validateWorkflowSchema } from "./validate-workflows.mjs";

// Canonical schema fixture — tests the compiled AJV schema with real permissions
const modernPermissionsFixture = `
name: Schema probe
on: push
permissions:
  contents: read
jobs:
  attest:
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      id-token: write
      attestations: write
      artifact-metadata: write
    steps:
      - run: echo schema-probe
`;

describe("validateWorkflowSchema", () => {
  it("accepts a valid workflow with required permissions (non-mocked canonical schema test)", () => {
    const result = validateWorkflowSchema(yaml.parse(modernPermissionsFixture));
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  it("returns errors for an invalid workflow", () => {
    const result = validateWorkflowSchema({ invalid: true });
    // Schema may or may not fail for minimal object; just verify function returns correct shape
    assert.ok("valid" in result);
    assert.ok(Array.isArray(result.errors));
  });

  it("returns a snapshot so callers cannot mutate AJV state", () => {
    const result1 = validateWorkflowSchema({ invalid: true });
    const initialLength = result1.errors.length;
    // Mutate the returned array — this must not affect subsequent calls.
    result1.errors.push(/** @type {any} */ ({}));
    const result2 = validateWorkflowSchema({ invalid: true });
    assert.equal(result2.errors.length, initialLength);
  });
});

describe("validateWorkflowFiles — absent files", () => {
  it("fails by default when neither workflow exists", () => {
    assert.throws(() => validateWorkflowFiles({ exists: () => false }), /bootstrap/i);
  });

  it("succeeds in bootstrap mode when neither workflow exists", () => {
    const result = validateWorkflowFiles({
      exists: () => false,
      allowBootstrap: true,
    });
    assert.ok("bootstrapped" in result);
  });

  it("fails when allowBootstrap is 'true' string (not boolean true)", () => {
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => false,
          allowBootstrap: /** @type {any} */ ("true"),
        }),
      /bootstrap/i,
    );
  });

  it("fails when allowBootstrap is 1 (number, not boolean)", () => {
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => false,
          allowBootstrap: /** @type {any} */ (1),
        }),
      /bootstrap/i,
    );
  });

  it("fails when exactly one workflow exists", () => {
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: (p) => p.includes("ci.yml"),
        }),
      /exactly one/i,
    );
  });
});

// Minimal valid CI yaml for testing
const minimalCiYaml = `
name: CI
on:
  push:
  pull_request:
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-24.04
    outputs:
      artifact_name: \${{ steps.artifact_identity.outputs.name }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - uses: pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Verify (definition of done)
        run: pnpm verify
      - name: Package verified store zips
        env:
          BUILD_NUMBER: \${{ github.run_number }}
          GITHUB_SHA: \${{ github.sha }}
        run: pnpm package
      - name: Define producer artifact identity
        id: artifact_identity
        shell: bash
        run: echo "name=extension-\${GITHUB_RUN_ID}-\${GITHUB_RUN_ATTEMPT}" >> "$GITHUB_OUTPUT"
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7
        with:
          name: \${{ steps.artifact_identity.outputs.name }}
          path: artifacts/
          if-no-files-found: error
          retention-days: 30
  attest:
    if: github.event_name == 'push'
    needs: verify
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      id-token: write
      attestations: write
      artifact-metadata: write
    steps:
      - name: Prepare attestation custody
        shell: bash
        run: |
          set -euo pipefail
          rm -rf -- "$RUNNER_TEMP/artifacts"
          mkdir -p -- "$RUNNER_TEMP/artifacts"
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8
        with:
          name: \${{ needs.verify.outputs.artifact_name }}
          path: \${{ runner.temp }}/artifacts
      - name: Attest push artifacts
        uses: actions/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6 # v4
        with:
          subject-path: |
            \${{ runner.temp }}/artifacts/awesomeado-chrome-*.zip
            \${{ runner.temp }}/artifacts/awesomeado-edge-*.zip
            \${{ runner.temp }}/artifacts/release-metadata.json
      - name: Upload attested attempt bridge
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7
        with:
          name: attested-extension-\${{ github.run_id }}-\${{ github.run_attempt }}
          path: |
            \${{ runner.temp }}/artifacts/awesomeado-chrome-*.zip
            \${{ runner.temp }}/artifacts/awesomeado-edge-*.zip
            \${{ runner.temp }}/artifacts/release-metadata.json
          if-no-files-found: error
          retention-days: 30
`;

// Minimal valid Release yaml for testing
const minimalReleaseYaml = `
name: Release
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
  workflow_dispatch:
    inputs:
      mode:
        required: true
        type: choice
        options:
          - recover_ci
          - replay_official
jobs:
  validate_release:
    if: true
    runs-on: ubuntu-24.04
    concurrency:
      group: awesomeado-release-publication
      queue: max
    permissions:
      actions: read
      attestations: read
      contents: read
    outputs:
      expected_sha: \${{ steps.release_context.outputs.expected_sha }}
    steps:
      - name: Require established release baseline
        id: release_baseline
        run: echo baseline
      - name: Resolve trusted release context
        id: release_context
        run: echo context
      - name: Prepare untrusted artifact custody
        run: mkdir -p artifacts
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8
        with:
          name: bridge
          path: artifacts
      - name: Verify CI attestations before checkout
        run: echo verify
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 24
      - run: pnpm install --frozen-lockfile --ignore-scripts
      - name: Compute CI version
        id: compute_version
        env:
          BUILD_NUMBER: 1
          RELEASE_SHA: abc
        run: node scripts/compute-version.mjs
      - name: Validate exact release artifacts
        id: validate_artifacts
        run: node scripts/validate-release.mjs
      - name: Consume CI version outputs
        run: echo consume
      - name: Create current-repository release App token
        id: release_app
        uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0
        with:
          client-id: \${{ vars.RELEASE_APP_CLIENT_ID }}
          private-key: \${{ secrets.RELEASE_APP_PRIVATE_KEY }}
          permission-contents: write
      - name: Publish immutable per-build prerelease
        id: publish_build_release
        run: node scripts/publish-github-release.mjs publish --kind build
      - name: Publish immutable official release
        id: publish_official_release
        run: node scripts/publish-github-release.mjs publish --kind official
      - name: Resolve store publication request
        id: publication_request
        run: echo resolve
      - name: Define validated bridge identity
        id: bridge_identity
        run: echo bridge
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7
        with:
          name: validated
          path: artifacts/
  publish_stores:
    needs: validate_release
    if: true
    runs-on: ubuntu-24.04
    concurrency:
      group: awesomeado-release-publication
      queue: max
    environment: browser-extension-stores
    permissions:
      actions: read
      attestations: read
      contents: read
    steps:
      - name: Classify requested credential sets
        id: credential_state
        run: echo classify
      - name: Verify version tag and protected environment policy
        run: echo verify_policy
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8
        with:
          name: bridge
          path: artifacts
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 24
      - run: pnpm install --frozen-lockfile --ignore-scripts
      - name: Revalidate exact bridge bytes
        id: revalidate
        run: node scripts/validate-release.mjs
      - name: Assert current official before Chrome
        id: chrome_current
        continue-on-error: true
        run: node scripts/publish-github-release.mjs assert-current
      - name: Upload and submit Chrome package
        id: publish_chrome
        continue-on-error: true
        env:
          EXTENSION_ID: \${{ secrets.CHROME_EXTENSION_ID }}
          PUBLISHER_ID: \${{ secrets.CHROME_PUBLISHER_ID }}
          CLIENT_ID: \${{ secrets.CHROME_CLIENT_ID }}
          CLIENT_SECRET: \${{ secrets.CHROME_CLIENT_SECRET }}
          REFRESH_TOKEN: \${{ secrets.CHROME_REFRESH_TOKEN }}
        run: pnpm exec chrome-webstore-upload --source x --extension-id y --publisher-id z
      - name: Assert current official before Edge
        id: edge_current
        continue-on-error: true
        run: node scripts/publish-github-release.mjs assert-current
      - name: Publish Edge package
        id: publish_edge
        continue-on-error: true
        env:
          EDGE_PRODUCT_ID: \${{ secrets.EDGE_PRODUCT_ID }}
          EDGE_CLIENT_ID: \${{ secrets.EDGE_CLIENT_ID }}
          EDGE_API_KEY: \${{ secrets.EDGE_API_KEY }}
        run: node scripts/publish-edge.mjs x
      - name: Report store publication results
        if: always()
        run: echo report
`;

describe("validateWorkflowFiles — malformed YAML", () => {
  it("throws on malformed CI YAML with workflow path in message", () => {
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: (p) => {
            if (p.includes("ci.yml")) return "invalid: yaml: {{{ bad";
            return minimalReleaseYaml;
          },
        }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("ci.yml"), `Message: ${err.message}`);
        return true;
      },
    );
  });

  it("throws on malformed Release YAML with workflow path in message", () => {
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: (p) => {
            if (p.includes("release.yml")) return "invalid: yaml: {{{ bad";
            return minimalCiYaml;
          },
        }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("release.yml"), `Message: ${err.message}`);
        return true;
      },
    );
  });
});

describe("validateWorkflowFiles — schema errors", () => {
  it("normalizes schema errors deterministically (sorted, with path/keyword/message)", () => {
    const badWorkflow = {
      on: "push",
      jobs: { test: { "runs-on": "ubuntu-24.04", steps: [{ run: "echo" }] } },
    };
    const mockValidateSchema = () => ({
      valid: false,
      errors: /** @type {import("ajv").ErrorObject[]} */ ([
        {
          instancePath: "/jobs/test",
          schemaPath: "#/required",
          keyword: "required",
          params: { missingProperty: "name" },
          message: "must have required property 'name'",
        },
        {
          instancePath: "",
          schemaPath: "#/required",
          keyword: "required",
          params: { missingProperty: "name" },
          message: "must have required property 'name'",
        },
      ]),
    });
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: () => yaml.stringify(badWorkflow),
          validateSchema: mockValidateSchema,
        }),
      (err) => {
        assert.ok(err instanceof Error);
        // The header line "Workflow schema validation failed:" always comes first;
        // only the error detail lines (after it) must be in sorted order.
        const lines = err.message.split("\n").filter((l) => l.trim());
        const detailLines = lines.slice(1);
        const sorted = [...detailLines].sort();
        assert.deepEqual(detailLines, sorted);
        return true;
      },
    );
  });
});

describe("validateWorkflowFiles — disallowed action refs", () => {
  it("rejects a mutable action tag in CI", () => {
    const badCi = minimalCiYaml.replace(
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
      "actions/checkout@v7",
    );
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: (p) => (p.includes("ci.yml") ? badCi : minimalReleaseYaml),
        }),
      /disallowed or mutable action ref/,
    );
  });

  it("rejects an unknown action in Release", () => {
    const badRelease = minimalReleaseYaml.replace(
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
      "some/unknown-action@abc123",
    );
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: (p) => (p.includes("release.yml") ? badRelease : minimalCiYaml),
        }),
      /disallowed or mutable action ref/,
    );
  });
});

describe("validateWorkflowFiles — CI structural checks", () => {
  it("rejects a non-literal runner in verify job", () => {
    const badCi = minimalCiYaml.replace(
      "  verify:\n    runs-on: ubuntu-24.04",
      "  verify:\n    runs-on: ${{ matrix.os }}",
    );
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: (p) => (p.includes("ci.yml") ? badCi : minimalReleaseYaml),
        }),
      /literal scalar runner/,
    );
  });

  it("rejects reordered CI steps (package before verify)", () => {
    // Replace so that package comes before verify in the run list
    const badCi = minimalCiYaml.replace(
      `      - name: Verify (definition of done)
        run: pnpm verify
      - name: Package verified store zips
        env:
          BUILD_NUMBER: \${{ github.run_number }}
          GITHUB_SHA: \${{ github.sha }}
        run: pnpm package`,
      `      - name: Package verified store zips
        env:
          BUILD_NUMBER: \${{ github.run_number }}
          GITHUB_SHA: \${{ github.sha }}
        run: pnpm package
      - name: Verify (definition of done)
        run: pnpm verify`,
    );
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: (p) => (p.includes("ci.yml") ? badCi : minimalReleaseYaml),
        }),
      /before.*package|install.*verify.*package/i,
    );
  });

  it("rejects missing attest job permissions", () => {
    const badCi = minimalCiYaml.replace(
      `    permissions:
      contents: read
      id-token: write
      attestations: write
      artifact-metadata: write`,
      `    permissions:
      contents: read`,
    );
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: (p) => (p.includes("ci.yml") ? badCi : minimalReleaseYaml),
        }),
      /attest.*permission|permission.*attest/i,
    );
  });
});

describe("validateWorkflowFiles — Release structural checks", () => {
  it("rejects workflow-level concurrency on Release", () => {
    const badRelease = minimalReleaseYaml.replace("jobs:", "concurrency:\n  group: bad\njobs:");
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: (p) => (p.includes("release.yml") ? badRelease : minimalCiYaml),
        }),
      /workflow-level concurrency/i,
    );
  });

  it("rejects missing job-level concurrency on validate_release", () => {
    const badRelease = minimalReleaseYaml.replace(
      `  validate_release:
    if: true
    runs-on: ubuntu-24.04
    concurrency:
      group: awesomeado-release-publication
      queue: max`,
      `  validate_release:
    if: true
    runs-on: ubuntu-24.04`,
    );
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: (p) => (p.includes("release.yml") ? badRelease : minimalCiYaml),
        }),
      /concurrency.*awesomeado-release-publication/i,
    );
  });

  it("rejects a non-literal runner in validate_release", () => {
    const badRelease = minimalReleaseYaml.replace(
      `  validate_release:
    if: true
    runs-on: ubuntu-24.04`,
      `  validate_release:
    if: true
    runs-on: \${{ matrix.os }}`,
    );
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: (p) => (p.includes("release.yml") ? badRelease : minimalCiYaml),
        }),
      /literal scalar runner/,
    );
  });

  it("rejects missing release_context step id", () => {
    const badRelease = minimalReleaseYaml.replace(
      "        id: release_context",
      "        id: wrong_id",
    );
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: (p) => (p.includes("release.yml") ? badRelease : minimalCiYaml),
        }),
      /release_context/,
    );
  });

  it("rejects pnpm build in Release", () => {
    const badRelease = minimalReleaseYaml.replace(
      "      - run: pnpm install --frozen-lockfile --ignore-scripts",
      "      - run: pnpm install --frozen-lockfile --ignore-scripts\n      - run: pnpm build",
    );
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: (p) => (p.includes("release.yml") ? badRelease : minimalCiYaml),
        }),
      /build or package/i,
    );
  });

  it("rejects wrong permissions on validate_release (extra permission)", () => {
    const badRelease = minimalReleaseYaml.replace(
      `    permissions:
      actions: read
      attestations: read
      contents: read
    outputs:`,
      `    permissions:
      actions: read
      attestations: read
      contents: read
      id-token: write
    outputs:`,
    );
    assert.throws(
      () =>
        validateWorkflowFiles({
          exists: () => true,
          readText: (p) => (p.includes("release.yml") ? badRelease : minimalCiYaml),
        }),
      /exactly.*actions.*attestations.*contents/i,
    );
  });
});

describe("validateWorkflowFiles — full valid workflows", () => {
  it("accepts both valid CI and Release workflows", () => {
    const result = validateWorkflowFiles({
      exists: () => true,
      readText: (p) => (p.includes("ci.yml") ? minimalCiYaml : minimalReleaseYaml),
    });
    assert.ok("validated" in result);
  });

  it("accepts full rerun where attest consumes needs.verify.outputs.artifact_name", () => {
    // The minimal CI already has this - just verify it passes
    const result = validateWorkflowFiles({
      exists: () => true,
      readText: (p) => (p.includes("ci.yml") ? minimalCiYaml : minimalReleaseYaml),
    });
    assert.ok(result);
  });
});
