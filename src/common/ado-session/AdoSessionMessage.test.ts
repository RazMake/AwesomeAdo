import { describe, expect, it } from "vitest";

import { ADO_SESSION_MESSAGE, isAdoSessionMessage } from "./AdoSessionMessage";

describe("isAdoSessionMessage", () => {
  it.each([true, false])("accepts a session message with signedIn=%s", (signedIn) => {
    expect(isAdoSessionMessage({ type: ADO_SESSION_MESSAGE, signedIn })).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", ADO_SESSION_MESSAGE],
    ["a number", 42],
    ["an object of another type", { type: "awesomeado:other", signedIn: true }],
    ["a session message without signedIn", { type: ADO_SESSION_MESSAGE }],
    [
      "a session message with a non-boolean signedIn",
      { type: ADO_SESSION_MESSAGE, signedIn: "true" },
    ],
  ])("rejects %s", (_label, message) => {
    expect(isAdoSessionMessage(message)).toBe(false);
  });
});
