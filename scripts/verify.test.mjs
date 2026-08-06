import assert from "node:assert/strict";
import test from "node:test";

import { canReuseVerification, createVerificationFingerprint, runStageWave } from "./verify.mjs";

test("verification fingerprint is order-independent and content-sensitive", () => {
  const first = createVerificationFingerprint(
    [
      { path: "b.ts", content: "two" },
      { path: "a.ts", content: "one" },
    ],
    "runtime",
  );
  const reordered = createVerificationFingerprint(
    [
      { path: "a.ts", content: "one" },
      { path: "b.ts", content: "two" },
    ],
    "runtime",
  );
  const changed = createVerificationFingerprint([{ path: "a.ts", content: "changed" }], "runtime");
  const changedRuntime = createVerificationFingerprint(
    [
      { path: "b.ts", content: "two" },
      { path: "a.ts", content: "one" },
    ],
    "other-runtime",
  );

  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  assert.notEqual(first, changedRuntime);
});

test("verification reuse requires the exact current fingerprint", () => {
  assert.equal(canReuseVerification("same", "same"), true);
  assert.equal(canReuseVerification("old", "new"), false);
  assert.equal(canReuseVerification(undefined, "new"), false);
});

test("stage wave starts independent stages before awaiting their results", async () => {
  /** @type {string[]} */
  const started = [];
  /** @type {Map<string, (exitCode: number) => void>} */
  const resolvers = new Map();
  /** @param {string} stage */
  const runStage = (stage) => {
    started.push(stage);
    return new Promise((resolve) => resolvers.set(stage, resolve));
  };

  const wave = runStageWave(["one", "two"], runStage);
  assert.deepEqual(started, ["one", "two"]);
  const resolveOne = resolvers.get("one");
  const resolveTwo = resolvers.get("two");
  assert.ok(resolveOne);
  assert.ok(resolveTwo);
  resolveOne(0);
  resolveTwo(1);

  assert.deepEqual(await wave, [{ stage: "two", exitCode: 1 }]);
});
