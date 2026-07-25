import { describe, expect, it } from "vitest";

import {
  isReconcileFeatureCrewMessage,
  RECONCILE_FEATURE_CREW_MESSAGE,
} from "./FeatureCrewRequest";

describe("isReconcileFeatureCrewMessage", () => {
  it("accepts a valid message", () => {
    expect(
      isReconcileFeatureCrewMessage({
        type: RECONCILE_FEATURE_CREW_MESSAGE,
        rootId: 123,
        typeName: "Epic",
        assignees: [
          { alias: "alice", fullName: "Alice Smith" },
          { alias: "bob", fullName: "Bob Jones" },
        ],
      }),
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isReconcileFeatureCrewMessage(null)).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(isReconcileFeatureCrewMessage("abc")).toBe(false);
  });

  it("rejects a wrong type discriminator", () => {
    expect(
      isReconcileFeatureCrewMessage({
        type: "other",
        rootId: 123,
        typeName: "Epic",
        assignees: [],
      }),
    ).toBe(false);
  });

  it("rejects a missing rootId", () => {
    expect(
      isReconcileFeatureCrewMessage({
        type: RECONCILE_FEATURE_CREW_MESSAGE,
        typeName: "Epic",
        assignees: [],
      }),
    ).toBe(false);
  });

  it("rejects a non-number rootId", () => {
    expect(
      isReconcileFeatureCrewMessage({
        type: RECONCILE_FEATURE_CREW_MESSAGE,
        rootId: "123",
        typeName: "Epic",
        assignees: [],
      }),
    ).toBe(false);
  });

  it("rejects a missing typeName", () => {
    expect(
      isReconcileFeatureCrewMessage({
        type: RECONCILE_FEATURE_CREW_MESSAGE,
        rootId: 123,
        assignees: [],
      }),
    ).toBe(false);
  });

  it("rejects a non-string typeName", () => {
    expect(
      isReconcileFeatureCrewMessage({
        type: RECONCILE_FEATURE_CREW_MESSAGE,
        rootId: 123,
        typeName: 123,
        assignees: [],
      }),
    ).toBe(false);
  });

  it("rejects a non-array assignees", () => {
    expect(
      isReconcileFeatureCrewMessage({
        type: RECONCILE_FEATURE_CREW_MESSAGE,
        rootId: 123,
        typeName: "Epic",
        assignees: "not-an-array",
      }),
    ).toBe(false);
  });

  it("rejects an assignees array containing a non-object", () => {
    expect(
      isReconcileFeatureCrewMessage({
        type: RECONCILE_FEATURE_CREW_MESSAGE,
        rootId: 123,
        typeName: "Epic",
        assignees: [{ alias: "alice", fullName: "Alice Smith" }, "not-an-object"],
      }),
    ).toBe(false);
  });

  it("rejects an assignees array containing an object missing alias", () => {
    expect(
      isReconcileFeatureCrewMessage({
        type: RECONCILE_FEATURE_CREW_MESSAGE,
        rootId: 123,
        typeName: "Epic",
        assignees: [{ fullName: "Alice Smith" }],
      }),
    ).toBe(false);
  });

  it("rejects an assignees array containing an object missing fullName", () => {
    expect(
      isReconcileFeatureCrewMessage({
        type: RECONCILE_FEATURE_CREW_MESSAGE,
        rootId: 123,
        typeName: "Epic",
        assignees: [{ alias: "alice" }],
      }),
    ).toBe(false);
  });
});
