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

/**
 * Publish an extension to the Microsoft Edge Add-ons store.
 * @param {PublishEdgeOptions} options
 * @returns {Promise<void>}
 */
export async function publishEdge(options) {
  // Validate option keys
  for (const key of Object.keys(options)) {
    if (!KNOWN_OPTIONS.has(key)) {
      throw new Error(`Unknown publishEdge option: ${key}`);
    }
  }

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
  let uploadResponse;
  try {
    uploadResponse = await fetchImpl(`${apiRoot}/submissions/draft/package`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/zip",
      },
      body: archiveBytes,
    });
  } catch (error) {
    throw new Error(
      `Edge upload failed (stage: upload): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (uploadResponse.status !== 202) {
    throw new Error(
      `Edge upload returned unexpected status ${uploadResponse.status} (stage: upload)`,
    );
  }

  const uploadLocation = uploadResponse.headers.get("location");
  if (!uploadLocation || uploadLocation.trim() === "") {
    throw new Error("Edge upload returned no Location operation ID (stage: upload)");
  }

  // Extract just the operation ID from the Location header
  const uploadOperationId = uploadLocation.split("/").pop() ?? uploadLocation;
  const encodedUploadOperationId = encodeURIComponent(uploadOperationId);

  // Step 2: Poll upload operation status
  await pollOperation(
    fetchImpl,
    sleep,
    `${apiRoot}/submissions/draft/package/operations/${encodedUploadOperationId}`,
    headers,
    maxAttempts,
    pollIntervalMs,
    "upload-poll",
  );

  // Step 3: Submit for publication
  let publishResponse;
  try {
    publishResponse = await fetchImpl(`${apiRoot}/submissions`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notes: certificationNotes }),
    });
  } catch (error) {
    throw new Error(
      `Edge publish request failed (stage: publish, upload operation: ${uploadOperationId}): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (publishResponse.status !== 202) {
    throw new Error(
      `Edge publish returned unexpected status ${publishResponse.status} (stage: publish, upload operation: ${uploadOperationId})`,
    );
  }

  const publishLocation = publishResponse.headers.get("location");
  if (!publishLocation || publishLocation.trim() === "") {
    throw new Error(
      `Edge publish returned no Location operation ID (stage: publish, upload operation: ${uploadOperationId})`,
    );
  }

  const publishOperationId = publishLocation.split("/").pop() ?? publishLocation;
  const encodedPublishOperationId = encodeURIComponent(publishOperationId);

  // Step 4: Poll publish operation status
  await pollOperation(
    fetchImpl,
    sleep,
    `${apiRoot}/submissions/operations/${encodedPublishOperationId}`,
    headers,
    maxAttempts,
    pollIntervalMs,
    `publish-poll (upload operation: ${uploadOperationId})`,
  );
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

    let response;
    try {
      response = await fetchImpl(url, { headers });
    } catch (error) {
      throw new Error(
        `Edge poll request failed (stage: ${stage}): ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new Error(`Edge poll returned HTTP ${response.status} (stage: ${stage})`);
    }

    let body;
    try {
      body = await response.json();
    } catch (error) {
      throw new Error(
        `Edge poll returned non-JSON response (stage: ${stage}): ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    const status = body?.status;

    if (status === "InProgress") {
      continue;
    }

    if (status === "Succeeded") {
      return;
    }

    if (status === "Failed") {
      const message = body?.message ?? body?.errors ?? "unknown error";
      throw new Error(`Edge operation failed (stage: ${stage}): ${JSON.stringify(message)}`);
    }

    throw new Error(`Edge operation returned unknown status '${status}' (stage: ${stage})`);
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
