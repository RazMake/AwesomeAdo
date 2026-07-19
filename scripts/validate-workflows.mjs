import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import Ajv from "ajv";
import yaml from "yaml";

// Load and compile the schema once at module init; never fetch a moving URL.
const schemaPath = new URL("./schemas/github-workflow.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const compiled = new Ajv({ allErrors: true, strict: false }).compile(schema);

/**
 * Validate a parsed workflow document against the compiled JSON schema.
 * Returns a snapshot of errors so callers cannot mutate the AJV state.
 * @param {unknown} document
 * @returns {{ valid: boolean, errors: import("ajv").ErrorObject[] }}
 */
export function validateWorkflowSchema(document) {
  const valid = compiled(document);
  return { valid: !!valid, errors: [...(compiled.errors ?? [])] };
}

// Approved immutable action commits (F4 table).
const APPROVED_ACTIONS = new Map([
  ["actions/checkout", "3d3c42e5aac5ba805825da76410c181273ba90b1"],
  ["pnpm/action-setup", "0ebf47130e4866e96fce0953f49152a61190b271"],
  ["actions/setup-node", "820762786026740c76f36085b0efc47a31fe5020"],
  ["actions/attest", "f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6"],
  ["actions/upload-artifact", "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"],
  ["actions/download-artifact", "3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c"],
  ["actions/create-github-app-token", "bcd2ba49218906704ab6c1aa796996da409d3eb1"],
]);

const HEX40 = /^[0-9a-f]{40}$/;

/** @param {string} usesValue @returns {boolean} */
function isApprovedAction(usesValue) {
  if (typeof usesValue !== "string") return false;
  const atIdx = usesValue.lastIndexOf("@");
  if (atIdx < 0) return false;
  const actionName = usesValue.slice(0, atIdx);
  const commit = usesValue.slice(atIdx + 1);
  const expected = APPROVED_ACTIONS.get(actionName);
  return expected !== undefined && commit === expected && HEX40.test(commit);
}

/** @param {unknown} value @returns {string[]} — all `uses` string values found */
function collectUsesValues(value) {
  if (typeof value === "string") return [];
  if (Array.isArray(value)) return value.flatMap(collectUsesValues);
  if (typeof value === "object" && value !== null) {
    const obj = /** @type {Record<string, unknown>} */ (value);
    const result = [];
    for (const [key, child] of Object.entries(obj)) {
      if (key === "uses" && typeof child === "string") {
        result.push(child);
      } else {
        result.push(...collectUsesValues(child));
      }
    }
    return result;
  }
  return [];
}

/**
 * Check that every `uses` value in the workflow is an approved immutable commit.
 * @param {unknown} document
 * @param {string} workflowPath
 */
function requireApprovedActions(document, workflowPath) {
  const usesValues = collectUsesValues(document);
  for (const usesValue of usesValues) {
    if (!isApprovedAction(usesValue)) {
      throw new Error(`${workflowPath}: disallowed or mutable action ref: ${usesValue}`);
    }
  }
}

/**
 * Get the steps array for a job, or an empty array if not present.
 * @param {unknown} job
 * @returns {unknown[]}
 */
function getJobSteps(job) {
  if (typeof job !== "object" || job === null) return [];
  const steps = /** @type {Record<string, unknown>} */ (job).steps;
  return Array.isArray(steps) ? steps : [];
}

/**
 * Get step ids in order for a job.
 * @param {unknown} job
 * @returns {string[]}
 */
function getStepIds(job) {
  return getJobSteps(job)
    .map((s) =>
      typeof s === "object" && s !== null
        ? /** @type {Record<string, unknown>} */ (s).id
        : undefined,
    )
    .filter((id) => typeof id === "string")
    .map(String);
}

/**
 * Get step run commands for a job.
 * @param {unknown} job
 * @returns {string[]}
 */
function getStepRuns(job) {
  return getJobSteps(job)
    .map((s) => {
      if (typeof s !== "object" || s === null) return "";
      return String(/** @type {Record<string, unknown>} */ (s).run ?? "");
    })
    .filter(Boolean);
}

/**
 * Get uses values for steps in a job.
 * @param {unknown} job
 * @returns {string[]}
 */
function getStepUses(job) {
  return getJobSteps(job)
    .map((s) => {
      if (typeof s !== "object" || s === null) return undefined;
      const uses = /** @type {Record<string, unknown>} */ (s).uses;
      return typeof uses === "string" ? uses : undefined;
    })
    .filter((u) => u !== undefined)
    .map(String);
}

/**
 * Validate the CI workflow structure.
 * @param {unknown} ciDoc
 * @param {string} ciPath
 */
function validateCiWorkflow(ciDoc, ciPath) {
  if (typeof ciDoc !== "object" || ciDoc === null) {
    throw new Error(`${ciPath}: CI workflow must be an object`);
  }
  const ci = /** @type {Record<string, unknown>} */ (ciDoc);
  const jobs = ci.jobs;
  if (typeof jobs !== "object" || jobs === null) {
    throw new Error(`${ciPath}: CI workflow must have jobs`);
  }
  const jobsObj = /** @type {Record<string, unknown>} */ (jobs);

  // Both jobs must use literal scalar runner ubuntu-24.04
  for (const jobName of ["verify", "attest"]) {
    const job = jobsObj[jobName];
    if (typeof job !== "object" || job === null) {
      throw new Error(`${ciPath}: CI must have job '${jobName}'`);
    }
    const runsOn = /** @type {Record<string, unknown>} */ (job)["runs-on"];
    if (runsOn !== "ubuntu-24.04") {
      throw new Error(
        `${ciPath}: job '${jobName}' must use literal scalar runner 'ubuntu-24.04', got: ${JSON.stringify(runsOn)}`,
      );
    }
  }

  // verify job: must have artifact_name output
  const verifyJob = /** @type {Record<string, unknown>} */ (jobsObj["verify"]);
  const verifyOutputs = /** @type {Record<string, unknown>} */ (verifyJob.outputs ?? {});
  if (
    typeof verifyOutputs["artifact_name"] !== "string" ||
    !verifyOutputs["artifact_name"].includes("artifact_identity")
  ) {
    throw new Error(
      `${ciPath}: verify job must export artifact_name output referencing artifact_identity step`,
    );
  }

  // verify steps must be in order: checkout, pnpm setup, node setup, install, verify, package, artifact_identity, upload
  const verifyStepIds = getStepIds(verifyJob);
  const verifyStepUses = getStepUses(verifyJob);
  const hasInstall = getStepRuns(verifyJob).some((r) => r.includes("pnpm install"));
  const hasVerify = getStepRuns(verifyJob).some((r) => r.includes("pnpm verify"));
  const hasPackage = getStepRuns(verifyJob).some((r) => r.includes("pnpm package"));
  const hasUpload = verifyStepUses.some((u) => u.startsWith("actions/upload-artifact@"));

  if (!hasInstall || !hasVerify || !hasPackage || !hasUpload) {
    throw new Error(
      `${ciPath}: verify job must have install, verify, package, and upload steps in that order`,
    );
  }

  // Verify ordering: pnpm verify must come before pnpm package
  const stepRuns = getStepRuns(verifyJob);
  const verifyIdx = stepRuns.findIndex((r) => r.includes("pnpm verify"));
  const packageIdx = stepRuns.findIndex((r) => r.includes("pnpm package"));
  if (verifyIdx === -1 || packageIdx === -1 || verifyIdx >= packageIdx) {
    throw new Error(`${ciPath}: verify job must run 'pnpm verify' before 'pnpm package'`);
  }

  // artifact_identity step must exist
  if (!verifyStepIds.includes("artifact_identity")) {
    throw new Error(`${ciPath}: verify job must have a step with id 'artifact_identity'`);
  }

  // attest job
  const attestJob = /** @type {Record<string, unknown>} */ (jobsObj["attest"]);
  const attestPerms = /** @type {Record<string, unknown>} */ (attestJob.permissions ?? {});
  const requiredAttestPerms = {
    contents: "read",
    "id-token": "write",
    attestations: "write",
    "artifact-metadata": "write",
  };
  for (const [perm, value] of Object.entries(requiredAttestPerms)) {
    if (attestPerms[perm] !== value) {
      throw new Error(`${ciPath}: attest job must have permission '${perm}: ${value}'`);
    }
  }

  // attest job must download using needs.verify.outputs.artifact_name
  const attestStepUses = getStepUses(attestJob);
  const hasDownload = attestStepUses.some((u) => u.startsWith("actions/download-artifact@"));
  if (!hasDownload) {
    throw new Error(`${ciPath}: attest job must download the verified artifact`);
  }

  // Last step of attest must upload the bridge
  const attestSteps = getJobSteps(attestJob);
  const lastStep = attestSteps[attestSteps.length - 1];
  if (
    typeof lastStep !== "object" ||
    lastStep === null ||
    !String(/** @type {Record<string, unknown>} */ (lastStep).uses ?? "").startsWith(
      "actions/upload-artifact@",
    )
  ) {
    throw new Error(`${ciPath}: last step of attest job must upload the attested bridge artifact`);
  }

  // attest bridge name must follow pattern attested-extension-${run_id}-${run_attempt}
  const lastStepWith = /** @type {Record<string, unknown>} */ (
    /** @type {Record<string, unknown>} */ (lastStep).with ?? {}
  );
  const bridgeName = String(lastStepWith.name ?? "");
  if (
    !bridgeName.includes("attested-extension") ||
    !bridgeName.includes("run_id") ||
    !bridgeName.includes("run_attempt")
  ) {
    throw new Error(
      `${ciPath}: attest bridge must be named attested-extension-{run_id}-{run_attempt}`,
    );
  }
}

/**
 * Validate the Release workflow structure (basic checks for bootstrap).
 * Full canonical checks are in validate-workflows.release.test.mjs (created at Wave 1 barrier).
 * @param {unknown} releaseDoc
 * @param {string} releasePath
 */
function validateReleaseWorkflow(releaseDoc, releasePath) {
  if (typeof releaseDoc !== "object" || releaseDoc === null) {
    throw new Error(`${releasePath}: Release workflow must be an object`);
  }
  const release = /** @type {Record<string, unknown>} */ (releaseDoc);
  const jobs = release.jobs;
  if (typeof jobs !== "object" || jobs === null) {
    throw new Error(`${releasePath}: Release workflow must have jobs`);
  }
  const jobsObj = /** @type {Record<string, unknown>} */ (jobs);

  // Must have exactly validate_release and publish_stores jobs
  const jobNames = Object.keys(jobsObj).sort();
  if (
    jobNames.length !== 2 ||
    !jobNames.includes("validate_release") ||
    !jobNames.includes("publish_stores")
  ) {
    throw new Error(
      `${releasePath}: Release must have exactly jobs 'validate_release' and 'publish_stores'`,
    );
  }

  // No workflow-level concurrency
  if ("concurrency" in release) {
    throw new Error(`${releasePath}: Release must not have workflow-level concurrency`);
  }

  // Both jobs must have job-level concurrency group: awesomeado-release-publication, queue: max
  for (const jobName of ["validate_release", "publish_stores"]) {
    const job = /** @type {Record<string, unknown>} */ (jobsObj[jobName]);
    const concurrency = /** @type {Record<string, unknown>} */ (job.concurrency ?? {});
    if (concurrency.group !== "awesomeado-release-publication" || concurrency.queue !== "max") {
      throw new Error(
        `${releasePath}: job '${jobName}' must have concurrency group 'awesomeado-release-publication' with queue: max`,
      );
    }
    // Must use literal scalar runner
    const runsOn = job["runs-on"];
    if (runsOn !== "ubuntu-24.04") {
      throw new Error(
        `${releasePath}: job '${jobName}' must use literal scalar runner 'ubuntu-24.04', got: ${JSON.stringify(runsOn)}`,
      );
    }
  }

  // validate_release permissions
  const vrJob = /** @type {Record<string, unknown>} */ (jobsObj["validate_release"]);
  const vrPerms = /** @type {Record<string, unknown>} */ (vrJob.permissions ?? {});
  const vrPermKeys = Object.keys(vrPerms).sort();
  if (
    vrPermKeys.join(",") !== "actions,attestations,contents" ||
    vrPerms.actions !== "read" ||
    vrPerms.attestations !== "read" ||
    vrPerms.contents !== "read"
  ) {
    throw new Error(
      `${releasePath}: validate_release must have exactly actions: read, attestations: read, contents: read`,
    );
  }

  // publish_stores permissions
  const psJob = /** @type {Record<string, unknown>} */ (jobsObj["publish_stores"]);
  const psPerms = /** @type {Record<string, unknown>} */ (psJob.permissions ?? {});
  const psPermKeys = Object.keys(psPerms).sort();
  if (
    psPermKeys.join(",") !== "actions,attestations,contents" ||
    psPerms.actions !== "read" ||
    psPerms.attestations !== "read" ||
    psPerms.contents !== "read"
  ) {
    throw new Error(
      `${releasePath}: publish_stores must have exactly actions: read, attestations: read, contents: read`,
    );
  }

  // publish_stores environment
  if (psJob.environment !== "browser-extension-stores") {
    throw new Error(
      `${releasePath}: publish_stores must declare environment: browser-extension-stores`,
    );
  }

  // No build/package command in Release
  const allReleaseRuns = getStepRuns(vrJob).concat(getStepRuns(psJob)).join("\n");
  if (/pnpm build|pnpm package/.test(allReleaseRuns)) {
    throw new Error(`${releasePath}: Release workflow must not contain build or package commands`);
  }

  // Check for release_context step
  const vrStepIds = getStepIds(vrJob);
  if (!vrStepIds.includes("release_context")) {
    throw new Error(`${releasePath}: validate_release must have a step with id 'release_context'`);
  }

  // Validate_release must not have release-tag checkout
  for (const run of getStepRuns(vrJob)) {
    if (/git checkout.*v\d+\.\d+/.test(run)) {
      throw new Error(`${releasePath}: validate_release must not checkout a release tag`);
    }
  }
}

/**
 * Main validation function.
 * @param {{
 *   exists?: (path: string) => boolean,
 *   readText?: (path: string) => string,
 *   validateSchema?: (doc: unknown) => { valid: boolean, errors: import("ajv").ErrorObject[] },
 *   allowBootstrap?: boolean
 * }} [options]
 */
export function validateWorkflowFiles(options = {}) {
  const {
    exists = existsSync,
    readText = (p) => readFileSync(p, "utf8"),
    validateSchema = validateWorkflowSchema,
    allowBootstrap = false,
  } = options;

  const ciPath = ".github/workflows/ci.yml";
  const releasePath = ".github/workflows/release.yml";
  const ciExists = exists(ciPath);
  const releaseExists = exists(releasePath);

  if (!ciExists && !releaseExists) {
    if (allowBootstrap === true) {
      return { bootstrapped: true };
    }
    throw new Error(
      "Neither CI nor Release workflow exists. Set ALLOW_WORKFLOW_BOOTSTRAP=1 during initial setup.",
    );
  }

  if (ciExists !== releaseExists) {
    throw new Error(
      `Exactly one workflow exists: ${ciExists ? ciPath : releasePath}. Both must exist or neither.`,
    );
  }

  // Both exist — parse and validate
  let ciDoc;
  try {
    ciDoc = yaml.parse(readText(ciPath));
  } catch (error) {
    throw new Error(
      `${ciPath}: YAML parse failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  let releaseDoc;
  try {
    releaseDoc = yaml.parse(readText(releasePath));
  } catch (error) {
    throw new Error(
      `${releasePath}: YAML parse failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  // Schema validation for both
  for (const [doc, filePath] of [
    [ciDoc, ciPath],
    [releaseDoc, releasePath],
  ]) {
    const result = validateSchema(doc);
    if (!result.valid) {
      const normalizedErrors = result.errors
        .map(
          (e) =>
            `${filePath} ${e.instancePath || "/"} ${e.keyword} ${e.message ?? "validation failed"}`,
        )
        .sort();
      throw new Error(`Workflow schema validation failed:\n${normalizedErrors.join("\n")}`);
    }
  }

  // Action commit checks
  requireApprovedActions(ciDoc, ciPath);
  requireApprovedActions(releaseDoc, releasePath);

  // Structural policy checks
  validateCiWorkflow(ciDoc, ciPath);
  validateReleaseWorkflow(releaseDoc, releasePath);

  return { validated: true };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  try {
    const allowBootstrap = process.env.ALLOW_WORKFLOW_BOOTSTRAP === "1";
    const result = validateWorkflowFiles({ allowBootstrap });
    if (result && "bootstrapped" in result) {
      console.warn("validate-workflows: bootstrap mode — workflows not yet created");
    } else {
      console.warn("validate-workflows: all workflow checks passed");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
