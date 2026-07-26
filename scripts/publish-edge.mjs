import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const KNOWN_OPTIONS = new Set([
  "archivePath",
  "productId",
  "clientId",
  "apiKey",
  "certificationNotes",
  "fetchImpl",
  "sleep",
  "maxAttempts",
  "pollIntervalMs",
]);

const DEFAULT_CERTIFICATION_NOTES = "Automated AwesomeADO release.";

/**
 * @typedef {object} PublishEdgeOptions
 * @property {string} archivePath
 * @property {string} productId
 * @property {string} clientId
 * @property {string} apiKey
 * @property {string} [certificationNotes]
 * @property {typeof fetch} [fetchImpl]
 * @property {(ms: number) => Promise<void>} [sleep]
 * @property {number} [maxAttempts]
 * @property {number} [pollIntervalMs]
 */

/** @param {unknown} error @returns {string} */
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reject any option key that is not part of the public contract.
 * @param {Record<string, unknown>} options
 */
function validateOptionKeys(options) {
  for (const key of Object.keys(options)) {
    if (!KNOWN_OPTIONS.has(key)) {
      throw new Error(`Unknown publishEdge option: ${key}`);
    }
  }
}

/**
 * POST to an Edge submissions endpoint and return the operation ID from the
 * Location header. Message builders keep each stage's error text verbatim.
 * @param {{
 *   fetchImpl: typeof fetch,
 *   url: string,
 *   init: RequestInit,
 *   requestFailed: (error: unknown) => string,
 *   badStatus: (status: number) => string,
 *   noLocation: () => string,
 * }} params
 * @returns {Promise<string>}
 */
async function postForOperationId({ fetchImpl, url, init, requestFailed, badStatus, noLocation }) {
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    throw new Error(requestFailed(error), { cause: error });
  }

  if (response.status !== 202) {
    throw new Error(badStatus(response.status));
  }

  const location = response.headers.get("location");
  if (!location || location.trim() === "") {
    throw new Error(noLocation());
  }

  // Extract just the operation ID from the Location header.
  return location.split("/").pop() ?? location;
}

/**
 * Publish an extension to the Microsoft Edge Add-ons store.
 * @param {PublishEdgeOptions} options
 * @returns {Promise<void>}
 */
export async function publishEdge(options) {
  validateOptionKeys(options);

  const {
    archivePath,
    productId,
    clientId,
    apiKey,
    certificationNotes = DEFAULT_CERTIFICATION_NOTES,
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    maxAttempts = 60,
    pollIntervalMs = 10_000,
  } = options;

  if (typeof certificationNotes !== "string" || certificationNotes.trim() === "") {
    throw new Error("certificationNotes must be a non-empty string");
  }

  const encodedProductId = encodeURIComponent(productId);
  const apiRoot = `https://api.addons.microsoftedge.microsoft.com/v1/products/${encodedProductId}`;
  const headers = {
    Authorization: `ApiKey ${apiKey}`,
    "X-ClientID": clientId,
  };

  // Step 1: Upload the draft package
  const archiveBytes = readFileSync(archivePath);
  const uploadOperationId = await postForOperationId({
    fetchImpl,
    url: `${apiRoot}/submissions/draft/package`,
    init: {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/zip" },
      body: archiveBytes,
    },
    requestFailed: (error) => `Edge upload failed (stage: upload): ${errorText(error)}`,
    badStatus: (status) => `Edge upload returned unexpected status ${status} (stage: upload)`,
    noLocation: () => "Edge upload returned no Location operation ID (stage: upload)",
  });

  // Step 2: Poll upload operation status
  await pollOperation(
    fetchImpl,
    sleep,
    `${apiRoot}/submissions/draft/package/operations/${encodeURIComponent(uploadOperationId)}`,
    headers,
    maxAttempts,
    pollIntervalMs,
    "upload-poll",
  );

  // Step 3: Submit for publication
  const publishOperationId = await postForOperationId({
    fetchImpl,
    url: `${apiRoot}/submissions`,
    init: {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ notes: certificationNotes }),
    },
    requestFailed: (error) =>
      `Edge publish request failed (stage: publish, upload operation: ${uploadOperationId}): ${errorText(error)}`,
    badStatus: (status) =>
      `Edge publish returned unexpected status ${status} (stage: publish, upload operation: ${uploadOperationId})`,
    noLocation: () =>
      `Edge publish returned no Location operation ID (stage: publish, upload operation: ${uploadOperationId})`,
  });

  // Step 4: Poll publish operation status
  await pollOperation(
    fetchImpl,
    sleep,
    `${apiRoot}/submissions/operations/${encodeURIComponent(publishOperationId)}`,
    headers,
    maxAttempts,
    pollIntervalMs,
    `publish-poll (upload operation: ${uploadOperationId})`,
  );
}

/**
 * Fetch and parse one poll response body, wrapping transport, HTTP, and JSON
 * failures with stage context.
 * @param {typeof fetch} fetchImpl
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {string} stage
 * @returns {Promise<{ status?: string, message?: unknown, errors?: unknown }>}
 */
async function fetchPollBody(fetchImpl, url, headers, stage) {
  let response;
  try {
    response = await fetchImpl(url, { headers });
  } catch (error) {
    throw new Error(`Edge poll request failed (stage: ${stage}): ${errorText(error)}`, {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new Error(`Edge poll returned HTTP ${response.status} (stage: ${stage})`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error(`Edge poll returned non-JSON response (stage: ${stage}): ${errorText(error)}`, {
      cause: error,
    });
  }
}

/**
 * Classify a poll response body into a terminal outcome.
 * @param {{ status?: string, message?: unknown, errors?: unknown }} body
 * @param {string} stage
 * @returns {"in-progress" | "succeeded"}
 */
function classifyPollStatus(body, stage) {
  const status = body?.status;

  if (status === "InProgress") {
    return "in-progress";
  }
  if (status === "Succeeded") {
    return "succeeded";
  }
  if (status === "Failed") {
    const message = body?.message ?? body?.errors ?? "unknown error";
    throw new Error(`Edge operation failed (stage: ${stage}): ${JSON.stringify(message)}`);
  }
  throw new Error(`Edge operation returned unknown status '${status}' (stage: ${stage})`);
}

/**
 * Poll an Edge operation until it completes.
 * @param {typeof fetch} fetchImpl
 * @param {(ms: number) => Promise<void>} sleep
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {number} maxAttempts
 * @param {number} pollIntervalMs
 * @param {string} stage
 */
async function pollOperation(fetchImpl, sleep, url, headers, maxAttempts, pollIntervalMs, stage) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(pollIntervalMs);
    }
    const body = await fetchPollBody(fetchImpl, url, headers, stage);
    if (classifyPollStatus(body, stage) === "succeeded") {
      return;
    }
  }

  throw new Error(`Edge operation timed out after ${maxAttempts} poll attempts (stage: ${stage})`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error("Usage: node scripts/publish-edge.mjs <archive-path>");
    process.exitCode = 1;
  } else {
    const archivePath = args[0];
    const productId = process.env.EDGE_PRODUCT_ID;
    const clientId = process.env.EDGE_CLIENT_ID;
    const apiKey = process.env.EDGE_API_KEY;

    if (!productId || productId.trim() === "") {
      console.error("EDGE_PRODUCT_ID must be set and non-blank");
      process.exitCode = 1;
    } else if (!clientId || clientId.trim() === "") {
      console.error("EDGE_CLIENT_ID must be set and non-blank");
      process.exitCode = 1;
    } else if (!apiKey || apiKey.trim() === "") {
      console.error("EDGE_API_KEY must be set and non-blank");
      process.exitCode = 1;
    } else {
      publishEdge({
        archivePath: archivePath ?? "",
        productId,
        clientId,
        apiKey,
      }).catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
    }
  }
}
