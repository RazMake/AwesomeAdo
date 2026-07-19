import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { publishEdge } from "./publish-edge.mjs";

const FAKE_ARCHIVE_PATH = "scripts/publish-edge.mjs"; // Use an existing file as fake archive
const FAKE_PRODUCT_ID = "test-product-id";
const FAKE_CLIENT_ID = "test-client-id";
const FAKE_API_KEY = "test-api-key";

/**
 * Build a minimal mock fetch that sequences upload → poll → publish → poll.
 * @param {Record<string, any>} [opts]
 */
function buildMockFetch(opts = {}) {
  const {
    uploadStatus = 202,
    uploadOperationId = "op-upload-1",
    uploadPollResponses = [{ status: "Succeeded" }],
    publishStatus = 202,
    publishOperationId = "op-publish-1",
    publishPollResponses = [{ status: "Succeeded" }],
    uploadError = null,
    publishError = null,
  } = opts;

  const calls = /** @type {Array<Record<string, any>>} */ ([]);
  let uploadPollIdx = 0;
  let publishPollIdx = 0;

  const fetchImpl = async (/** @type {any} */ url, /** @type {any} */ init = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers ?? {} });

    if (url.includes("/submissions/draft/package") && !url.includes("/operations/")) {
      if (uploadError) throw new Error(uploadError);
      return {
        status: uploadStatus,
        ok: uploadStatus >= 200 && uploadStatus < 300,
        headers: {
          get: (/** @type {any} */ name) =>
            name.toLowerCase() === "location" && uploadStatus === 202
              ? `/v1/products/x/submissions/draft/package/operations/${uploadOperationId}`
              : null,
        },
        json: async () => ({}),
      };
    }

    if (url.includes("/submissions/draft/package/operations/")) {
      const resp = uploadPollResponses[uploadPollIdx++] ?? { status: "Succeeded" };
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        json: async () => resp,
      };
    }

    if (
      url.includes("/submissions") &&
      (init.method ?? "") === "POST" &&
      !url.includes("/operations/")
    ) {
      if (publishError) throw new Error(publishError);
      return {
        status: publishStatus,
        ok: publishStatus >= 200 && publishStatus < 300,
        headers: {
          get: (/** @type {any} */ name) =>
            name.toLowerCase() === "location" && publishStatus === 202
              ? `/v1/products/x/submissions/operations/${publishOperationId}`
              : null,
        },
        json: async () => ({}),
      };
    }

    if (url.includes("/submissions/operations/")) {
      const resp = publishPollResponses[publishPollIdx++] ?? { status: "Succeeded" };
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        json: async () => resp,
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  return { fetchImpl: /** @type {any} */ (fetchImpl), calls };
}

describe("publishEdge — successful flow", () => {
  it("calls upload, polls upload, publishes, and polls publish in sequence", async () => {
    const { fetchImpl, calls } = buildMockFetch({});

    await publishEdge({
      archivePath: FAKE_ARCHIVE_PATH,
      productId: FAKE_PRODUCT_ID,
      clientId: FAKE_CLIENT_ID,
      apiKey: FAKE_API_KEY,
      fetchImpl,
      sleep: () => Promise.resolve(),
    });

    // Verify sequence
    assert.equal(calls.length, 4);
    assert.ok(calls[0]?.url.includes("/submissions/draft/package"), "1st: upload");
    assert.equal(calls[0]?.method, "POST");
    assert.ok(calls[1]?.url.includes("/submissions/draft/package/operations/"), "2nd: poll upload");
    assert.ok(
      calls[2]?.url.includes("/submissions") &&
        calls[2]?.method === "POST" &&
        !calls[2]?.url.includes("/operations/"),
      "3rd: publish",
    );
    assert.ok(calls[3]?.url.includes("/submissions/operations/"), "4th: poll publish");
  });

  it("uses correct headers on all requests", async () => {
    const { fetchImpl, calls } = buildMockFetch({});

    await publishEdge({
      archivePath: FAKE_ARCHIVE_PATH,
      productId: FAKE_PRODUCT_ID,
      clientId: FAKE_CLIENT_ID,
      apiKey: FAKE_API_KEY,
      fetchImpl,
      sleep: () => Promise.resolve(),
    });

    for (const call of calls) {
      assert.equal(call.headers?.["Authorization"], `ApiKey ${FAKE_API_KEY}`);
      assert.equal(call.headers?.["X-ClientID"], FAKE_CLIENT_ID);
    }
  });

  it("sends certificationNotes in the publish body", async () => {
    let publishBody;
    const { fetchImpl } = buildMockFetch({});
    const wrappedFetch = async (/** @type {any} */ url, /** @type {any} */ init) => {
      if (
        url.includes("/submissions") &&
        (init?.method ?? "") === "POST" &&
        !url.includes("/operations/")
      ) {
        publishBody = init?.body;
      }
      return fetchImpl(url, init);
    };

    await publishEdge({
      archivePath: FAKE_ARCHIVE_PATH,
      productId: FAKE_PRODUCT_ID,
      clientId: FAKE_CLIENT_ID,
      apiKey: FAKE_API_KEY,
      certificationNotes: "Custom notes.",
      fetchImpl: wrappedFetch,
      sleep: () => Promise.resolve(),
    });

    assert.equal(publishBody, JSON.stringify({ notes: "Custom notes." }));
  });

  it("polls multiple times for InProgress before Succeeded", async () => {
    const { fetchImpl, calls } = buildMockFetch({
      uploadPollResponses: [
        { status: "InProgress" },
        { status: "InProgress" },
        { status: "Succeeded" },
      ],
    });
    let sleepCallCount = 0;

    await publishEdge({
      archivePath: FAKE_ARCHIVE_PATH,
      productId: FAKE_PRODUCT_ID,
      clientId: FAKE_CLIENT_ID,
      apiKey: FAKE_API_KEY,
      fetchImpl,
      sleep: async () => {
        sleepCallCount++;
      },
    });

    // 1 upload + 3 upload polls + 1 publish + 1 publish poll
    assert.equal(calls.filter((c) => c.url.includes("/operations/")).length, 4);
    assert.equal(sleepCallCount, 2); // sleep between polls (not before first attempt)
  });
});

describe("publishEdge — upload failure", () => {
  it("throws on upload network error (exactly once)", async () => {
    const { fetchImpl, calls } = buildMockFetch({ uploadError: "network error" });

    await assert.rejects(
      () =>
        publishEdge({
          archivePath: FAKE_ARCHIVE_PATH,
          productId: FAKE_PRODUCT_ID,
          clientId: FAKE_CLIENT_ID,
          apiKey: FAKE_API_KEY,
          fetchImpl,
          sleep: () => Promise.resolve(),
        }),
      /upload failed/i,
    );

    // Upload must have been called exactly once (no retry)
    assert.equal(
      calls.filter((c) => c.url.includes("/draft/package") && !c.url.includes("/operations/"))
        .length,
      1,
    );
  });

  it("throws on upload HTTP error (non-202)", async () => {
    const { fetchImpl } = buildMockFetch({ uploadStatus: 400 });

    await assert.rejects(
      () =>
        publishEdge({
          archivePath: FAKE_ARCHIVE_PATH,
          productId: FAKE_PRODUCT_ID,
          clientId: FAKE_CLIENT_ID,
          apiKey: FAKE_API_KEY,
          fetchImpl,
          sleep: () => Promise.resolve(),
        }),
      /upload returned unexpected status 400/i,
    );
  });

  it("throws when upload Location is missing", async () => {
    const { fetchImpl } = buildMockFetch({ uploadStatus: 202, uploadOperationId: "" });
    const noLocationFetch = async (/** @type {any} */ url, /** @type {any} */ init) => {
      const response = await fetchImpl(url, init);
      if (url.includes("/draft/package") && !url.includes("/operations/")) {
        return {
          ...response,
          headers: { get: () => null },
        };
      }
      return response;
    };

    await assert.rejects(
      () =>
        publishEdge({
          archivePath: FAKE_ARCHIVE_PATH,
          productId: FAKE_PRODUCT_ID,
          clientId: FAKE_CLIENT_ID,
          apiKey: FAKE_API_KEY,
          fetchImpl: noLocationFetch,
          sleep: () => Promise.resolve(),
        }),
      /no Location/i,
    );
  });
});

describe("publishEdge — publish failure", () => {
  it("throws on publish HTTP error (non-202)", async () => {
    const { fetchImpl } = buildMockFetch({ publishStatus: 500 });

    await assert.rejects(
      () =>
        publishEdge({
          archivePath: FAKE_ARCHIVE_PATH,
          productId: FAKE_PRODUCT_ID,
          clientId: FAKE_CLIENT_ID,
          apiKey: FAKE_API_KEY,
          fetchImpl,
          sleep: () => Promise.resolve(),
        }),
      /publish returned unexpected status 500/i,
    );
  });

  it("throws on publish network error (exactly once)", async () => {
    const { fetchImpl, calls } = buildMockFetch({ publishError: "publish network error" });

    await assert.rejects(
      () =>
        publishEdge({
          archivePath: FAKE_ARCHIVE_PATH,
          productId: FAKE_PRODUCT_ID,
          clientId: FAKE_CLIENT_ID,
          apiKey: FAKE_API_KEY,
          fetchImpl,
          sleep: () => Promise.resolve(),
        }),
      /publish request failed/i,
    );

    // Publish POST must have been called exactly once (exclude the upload /draft/package call)
    const publishCalls = calls.filter(
      (c) =>
        c.url.includes("/submissions") &&
        c.method === "POST" &&
        !c.url.includes("/operations/") &&
        !c.url.includes("/draft/"),
    );
    assert.equal(publishCalls.length, 1);
  });
});

describe("publishEdge — poll failure", () => {
  it("throws on Failed operation status", async () => {
    const { fetchImpl } = buildMockFetch({
      uploadPollResponses: [{ status: "Failed", message: "validation error" }],
    });

    await assert.rejects(
      () =>
        publishEdge({
          archivePath: FAKE_ARCHIVE_PATH,
          productId: FAKE_PRODUCT_ID,
          clientId: FAKE_CLIENT_ID,
          apiKey: FAKE_API_KEY,
          fetchImpl,
          sleep: () => Promise.resolve(),
        }),
      /Edge operation failed/i,
    );
  });

  it("throws on unknown operation status", async () => {
    const { fetchImpl } = buildMockFetch({
      uploadPollResponses: [{ status: "UnknownStatus" }],
    });

    await assert.rejects(
      () =>
        publishEdge({
          archivePath: FAKE_ARCHIVE_PATH,
          productId: FAKE_PRODUCT_ID,
          clientId: FAKE_CLIENT_ID,
          apiKey: FAKE_API_KEY,
          fetchImpl,
          sleep: () => Promise.resolve(),
        }),
      /unknown status/i,
    );
  });

  it("throws on poll timeout after maxAttempts", async () => {
    const neverSucceed = Array(5).fill({ status: "InProgress" });
    const { fetchImpl } = buildMockFetch({ uploadPollResponses: neverSucceed });

    await assert.rejects(
      () =>
        publishEdge({
          archivePath: FAKE_ARCHIVE_PATH,
          productId: FAKE_PRODUCT_ID,
          clientId: FAKE_CLIENT_ID,
          apiKey: FAKE_API_KEY,
          fetchImpl,
          sleep: () => Promise.resolve(),
          maxAttempts: 3,
        }),
      /timed out/i,
    );
  });

  it("throws on bad HTTP response during poll", async () => {
    const errorFetch = async (/** @type {any} */ url, /** @type {any} */ init) => {
      if (url.includes("/operations/")) {
        return {
          status: 503,
          ok: false,
          headers: { get: () => null },
          json: async () => ({}),
        };
      }
      return buildMockFetch({}).fetchImpl(url, init);
    };

    await assert.rejects(
      () =>
        publishEdge({
          archivePath: FAKE_ARCHIVE_PATH,
          productId: FAKE_PRODUCT_ID,
          clientId: FAKE_CLIENT_ID,
          apiKey: FAKE_API_KEY,
          fetchImpl: errorFetch,
          sleep: () => Promise.resolve(),
        }),
      /HTTP 503/,
    );
  });
});

describe("publishEdge — unknown options", () => {
  it("throws on unknown option keys", async () => {
    await assert.rejects(
      () =>
        publishEdge(
          /** @type {any} */ ({
            archivePath: FAKE_ARCHIVE_PATH,
            productId: FAKE_PRODUCT_ID,
            clientId: FAKE_CLIENT_ID,
            apiKey: FAKE_API_KEY,
            unknownOption: true,
            fetchImpl: buildMockFetch({}).fetchImpl,
            sleep: () => Promise.resolve(),
          }),
        ),
      /Unknown publishEdge option/,
    );
  });

  it("throws on blank certificationNotes override", async () => {
    await assert.rejects(
      () =>
        publishEdge({
          archivePath: FAKE_ARCHIVE_PATH,
          productId: FAKE_PRODUCT_ID,
          clientId: FAKE_CLIENT_ID,
          apiKey: FAKE_API_KEY,
          certificationNotes: "   ",
          fetchImpl: buildMockFetch({}).fetchImpl,
          sleep: () => Promise.resolve(),
        }),
      /certificationNotes/,
    );
  });
});
