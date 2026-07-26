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
 * Require a workflow document to be an object with a jobs object, returning jobs.
 * @param {unknown} doc
 * @param {string} docPath
 * @param {string} label — "CI" or "Release", used verbatim in the error text
 * @returns {Record<string, unknown>}
 */
function requireJobsObject(doc, docPath, label) {
  if (typeof doc !== "object" || doc === null) {
    throw new Error(`${docPath}: ${label} workflow must be an object`);
  }
  const jobs = /** @type {Record<string, unknown>} */ (doc).jobs;
  if (typeof jobs !== "object" || jobs === null) {
    throw new Error(`${docPath}: ${label} workflow must have jobs`);
  }
  return /** @type {Record<string, unknown>} */ (jobs);
}

/**
 * Require a job to pin the literal scalar runner (never an expression).
 * @param {unknown} job
 * @param {string} jobName
 * @param {string} docPath
 */
function assertLiteralRunner(job, jobName, docPath) {
  const runsOn = /** @type {Record<string, unknown>} */ (job)["runs-on"];
  if (runsOn !== "ubuntu-24.04") {
    throw new Error(
      `${docPath}: job '${jobName}' must use literal scalar runner 'ubuntu-24.04', got: ${JSON.stringify(runsOn)}`,
    );
  }
}

/**
 * Both CI jobs must exist and pin the literal scalar runner.
 * @param {Record<string, unknown>} jobsObj
 * @param {string} ciPath
 */
function assertCiRunners(jobsObj, ciPath) {
  for (const jobName of ["verify", "attest"]) {
    const job = jobsObj[jobName];
    if (typeof job !== "object" || job === null) {
      throw new Error(`${ciPath}: CI must have job '${jobName}'`);
    }
    assertLiteralRunner(job, jobName, ciPath);
  }
}

/**
 * The verify job must expose the required steps in order.
 * @param {Record<string, unknown>} verifyJob
 * @param {string} ciPath
 */
function assertVerifyStepsPresent(verifyJob, ciPath) {
  const verifyStepIds = getStepIds(verifyJob);
  const verifyStepUses = getStepUses(verifyJob);
  const stepRuns = getStepRuns(verifyJob);
  const hasInstall = stepRuns.some((r) => r.includes("pnpm install"));
  const hasVerify = stepRuns.some((r) => r.includes("pnpm verify"));
  const hasPackage = stepRuns.some((r) => r.includes("pnpm package"));
  const hasUpload = verifyStepUses.some((u) => u.startsWith("actions/upload-artifact@"));
  if (!hasInstall || !hasVerify || !hasPackage || !hasUpload) {
    throw new Error(
      `${ciPath}: verify job must have install, verify, package, and upload steps in that order`,
    );
  }

  const verifyIdx = stepRuns.findIndex((r) => r.includes("pnpm verify"));
  const packageIdx = stepRuns.findIndex((r) => r.includes("pnpm package"));
  if (verifyIdx === -1 || packageIdx === -1 || verifyIdx >= packageIdx) {
    throw new Error(`${ciPath}: verify job must run 'pnpm verify' before 'pnpm package'`);
  }

  if (!verifyStepIds.includes("artifact_identity")) {
    throw new Error(`${ciPath}: verify job must have a step with id 'artifact_identity'`);
  }
}

/**
 * The verify job must export the artifact_name output and its ordered steps.
 * @param {Record<string, unknown>} jobsObj
 * @param {string} ciPath
 */
function validateVerifyJob(jobsObj, ciPath) {
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
  assertVerifyStepsPresent(verifyJob, ciPath);
}

/**
 * The last attest step must upload a correctly named bridge artifact.
 * @param {Record<string, unknown>} attestJob
 * @param {string} ciPath
 */
function assertAttestBridgeUpload(attestJob, ciPath) {
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
 * The attest job must hold the required permissions, download the artifact, and
 * upload the attested bridge.
 * @param {Record<string, unknown>} jobsObj
 * @param {string} ciPath
 */
function validateAttestJob(jobsObj, ciPath) {
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

  const attestStepUses = getStepUses(attestJob);
  const hasDownload = attestStepUses.some((u) => u.startsWith("actions/download-artifact@"));
  if (!hasDownload) {
    throw new Error(`${ciPath}: attest job must download the verified artifact`);
  }

  assertAttestBridgeUpload(attestJob, ciPath);
}

/**
 * Validate the CI workflow structure.
 * @param {unknown} ciDoc
 * @param {string} ciPath
 */
function validateCiWorkflow(ciDoc, ciPath) {
  const jobsObj = requireJobsObject(ciDoc, ciPath, "CI");
  assertCiRunners(jobsObj, ciPath);
  validateVerifyJob(jobsObj, ciPath);
  validateAttestJob(jobsObj, ciPath);
}

/**
 * Release must declare exactly the validate_release and publish_stores jobs.
 * @param {Record<string, unknown>} jobsObj
 * @param {string} releasePath
 */
function assertReleaseJobNames(jobsObj, releasePath) {
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
}

/**
 * Reject workflow-level concurrency and require the serialized per-job group plus
 * a literal runner on both release jobs.
 * @param {Record<string, unknown>} release
 * @param {Record<string, unknown>} jobsObj
 * @param {string} releasePath
 */
function assertReleaseConcurrency(release, jobsObj, releasePath) {
  if ("concurrency" in release) {
    throw new Error(`${releasePath}: Release must not have workflow-level concurrency`);
  }
  for (const jobName of ["validate_release", "publish_stores"]) {
    const job = /** @type {Record<string, unknown>} */ (jobsObj[jobName]);
    const concurrency = /** @type {Record<string, unknown>} */ (job.concurrency ?? {});
    if (concurrency.group !== "awesomeado-release-publication" || concurrency.queue !== "max") {
      throw new Error(
        `${releasePath}: job '${jobName}' must have concurrency group 'awesomeado-release-publication' with queue: max`,
      );
    }
    assertLiteralRunner(job, jobName, releasePath);
  }
}

/**
 * A release job must hold exactly the three read-only permissions.
 * @param {Record<string, unknown>} job
 * @param {string} releasePath
 * @param {string} jobName
 */
function assertReadOnlyReleasePermissions(job, releasePath, jobName) {
  const perms = /** @type {Record<string, unknown>} */ (job.permissions ?? {});
  const permKeys = Object.keys(perms).sort();
  if (
    permKeys.join(",") !== "actions,attestations,contents" ||
    perms.actions !== "read" ||
    perms.attestations !== "read" ||
    perms.contents !== "read"
  ) {
    throw new Error(
      `${releasePath}: ${jobName} must have exactly actions: read, attestations: read, contents: read`,
    );
  }
}

/**
 * Release must never build/package and must expose the release_context step
 * without checking out a release tag.
 * @param {Record<string, unknown>} vrJob
 * @param {Record<string, unknown>} psJob
 * @param {string} releasePath
 */
function assertReleaseStepsPolicy(vrJob, psJob, releasePath) {
  const allReleaseRuns = getStepRuns(vrJob).concat(getStepRuns(psJob)).join("\n");
  if (/pnpm build|pnpm package/.test(allReleaseRuns)) {
    throw new Error(`${releasePath}: Release workflow must not contain build or package commands`);
  }

  const vrStepIds = getStepIds(vrJob);
  if (!vrStepIds.includes("release_context")) {
    throw new Error(`${releasePath}: validate_release must have a step with id 'release_context'`);
  }

  for (const run of getStepRuns(vrJob)) {
    if (/git checkout.*v\d+\.\d+/.test(run)) {
      throw new Error(`${releasePath}: validate_release must not checkout a release tag`);
    }
  }
}

/**
 * Validate the Release workflow structure (basic checks for bootstrap).
 * Full canonical checks are in validate-workflows.release.test.mjs (created at Wave 1 barrier).
 * @param {unknown} releaseDoc
 * @param {string} releasePath
 */
function validateReleaseWorkflow(releaseDoc, releasePath) {
  const jobsObj = requireJobsObject(releaseDoc, releasePath, "Release");
  const release = /** @type {Record<string, unknown>} */ (releaseDoc);
  assertReleaseJobNames(jobsObj, releasePath);
  assertReleaseConcurrency(release, jobsObj, releasePath);

  const vrJob = /** @type {Record<string, unknown>} */ (jobsObj["validate_release"]);
  assertReadOnlyReleasePermissions(vrJob, releasePath, "validate_release");
  const psJob = /** @type {Record<string, unknown>} */ (jobsObj["publish_stores"]);
  assertReadOnlyReleasePermissions(psJob, releasePath, "publish_stores");

  if (psJob.environment !== "browser-extension-stores") {
    throw new Error(
      `${releasePath}: publish_stores must declare environment: browser-extension-stores`,
    );
  }

  assertReleaseStepsPolicy(vrJob, psJob, releasePath);
}

/**
 * Resolve which workflows are present and whether to bootstrap or proceed.
 * @param {(path: string) => boolean} exists
 * @param {string} ciPath
 * @param {string} releasePath
 * @param {boolean} allowBootstrap
 * @returns {"bootstrap" | "proceed"}
 */
function resolveWorkflowPresence(exists, ciPath, releasePath, allowBootstrap) {
  const ciExists = exists(ciPath);
  const releaseExists = exists(releasePath);

  if (!ciExists && !releaseExists) {
    if (allowBootstrap === true) {
      return "bootstrap";
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
  return "proceed";
}

/**
 * Parse a workflow file, wrapping YAML errors with the file path.
 * @param {(path: string) => string} readText
 * @param {string} filePath
 * @returns {unknown}
 */
function parseWorkflowYaml(readText, filePath) {
  try {
    return yaml.parse(readText(filePath));
  } catch (error) {
    throw new Error(
      `${filePath}: YAML parse failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/**
 * Run schema validation for one workflow document, throwing on failure.
 * @param {(doc: unknown) => { valid: boolean, errors: import("ajv").ErrorObject[] }} validateSchema
 * @param {unknown} doc
 * @param {string} filePath
 */
function assertSchemaValid(validateSchema, doc, filePath) {
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

  if (resolveWorkflowPresence(exists, ciPath, releasePath, allowBootstrap) === "bootstrap") {
    return { bootstrapped: true };
  }

  const ciDoc = parseWorkflowYaml(readText, ciPath);
  const releaseDoc = parseWorkflowYaml(readText, releasePath);

  assertSchemaValid(validateSchema, ciDoc, ciPath);
  assertSchemaValid(validateSchema, releaseDoc, releasePath);

  requireApprovedActions(ciDoc, ciPath);
  requireApprovedActions(releaseDoc, releasePath);

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
