import { describe, expect, it } from "vitest";

import { ADO_CONNECTION_DATA_API_VERSION } from "../ado/adoApi";

import {
  buildAdoSessionProbeUrl,
  classifyAdoSessionProbe,
  type AdoSessionProbeOutcome,
} from "./AdoSessionProbe";

const SIGNED_IN_BODY = JSON.stringify({
  authenticatedUser: {
    id: "user-1",
    descriptor: "Microsoft.IdentityModel.Claims.ClaimsIdentity;x",
  },
});

function outcome(status: number, body: string | null): AdoSessionProbeOutcome {
  return { status, body };
}

describe("buildAdoSessionProbeUrl", () => {
  it("targets the organization's ConnectionData with the pinned preview api-version", () => {
    expect(buildAdoSessionProbeUrl("https://dev.azure.com/contoso")).toBe(
      `https://dev.azure.com/contoso/_apis/ConnectionData?api-version=${ADO_CONNECTION_DATA_API_VERSION}`,
    );
  });
});

describe("classifyAdoSessionProbe by status", () => {
  it.each([401, 300, 302, 399])(
    "treats HTTP %i as expired even with a signed-in body",
    (status) => {
      expect(classifyAdoSessionProbe(outcome(status, SIGNED_IN_BODY))).toBe("expired");
    },
  );

  it.each([0, 199, 403, 429, 500, 503])("treats HTTP %i as unknown", (status) => {
    expect(classifyAdoSessionProbe(outcome(status, SIGNED_IN_BODY))).toBe("unknown");
  });

  it("treats a success with no body as unknown", () => {
    expect(classifyAdoSessionProbe({ status: 200, body: null, error: "unreadable body" })).toBe(
      "unknown",
    );
  });
});

describe("classifyAdoSessionProbe by body", () => {
  it("treats a success carrying HTML (the sign-in page) as expired", () => {
    expect(classifyAdoSessionProbe(outcome(200, "<!DOCTYPE html><html></html>"))).toBe("expired");
  });

  it.each([
    ["JSON null", "null"],
    ["no authenticatedUser", JSON.stringify({ instanceId: "x" })],
    ["authenticatedUser without id", JSON.stringify({ authenticatedUser: { descriptor: "d" } })],
    ["authenticatedUser with an empty id", JSON.stringify({ authenticatedUser: { id: "" } })],
  ])("treats %s as expired", (_label, body) => {
    expect(classifyAdoSessionProbe(outcome(200, body))).toBe("expired");
  });

  it("treats the anonymous identity as expired", () => {
    const body = JSON.stringify({
      authenticatedUser: {
        id: "anon",
        descriptor: "Microsoft.TeamFoundation.UnauthenticatedIdentity;anonymous",
      },
    });

    expect(classifyAdoSessionProbe(outcome(200, body))).toBe("expired");
  });

  it("treats a named identity as signed in", () => {
    expect(classifyAdoSessionProbe(outcome(200, SIGNED_IN_BODY))).toBe("signed-in");
  });

  it("treats a named identity without a descriptor as signed in", () => {
    const body = JSON.stringify({ authenticatedUser: { id: "user-1" } });

    expect(classifyAdoSessionProbe(outcome(299, body))).toBe("signed-in");
  });
});
