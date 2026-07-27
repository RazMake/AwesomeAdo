import { describe, expect, it } from "vitest";

import { DEFAULT_ORDERING_POLICY } from "../../../common/ordering/ItemOrdering";

import {
  hideResolvedAfterDays,
  orderingPolicyOf,
  projectTrackingViewType,
  updatesWindowWeeks,
} from "./projectTrackingViewType";

describe("orderingPolicyOf", () => {
  it("falls back to the default policy when the binding stored none", () => {
    expect(orderingPolicyOf({})).toBe(DEFAULT_ORDERING_POLICY);
  });

  it("returns the stored policy when it is one the view still offers", () => {
    expect(orderingPolicyOf({ orderingPolicy: "title" })).toBe("title");
    expect(orderingPolicyOf({ orderingPolicy: "eta" })).toBe("eta");
  });

  it("falls back to the default for a policy this build no longer offers", () => {
    // A binding written by another build must never hand the renderer a policy nothing can sort by.
    expect(orderingPolicyOf({ orderingPolicy: "by-phase-of-the-moon" })).toBe(
      DEFAULT_ORDERING_POLICY,
    );
  });

  it("reads the same property key the binding form writes", () => {
    const property = projectTrackingViewType.properties.find((p) => p.key === "orderingPolicy");
    expect(property?.kind).toBe("select");
    expect(property?.defaultValue).toBe(DEFAULT_ORDERING_POLICY);
  });
});

describe("hideResolvedAfterDays", () => {
  it("defaults to the declared window when the binding stored none", () => {
    expect(hideResolvedAfterDays({})).toBe(4);
  });

  it("returns the stored window as a number", () => {
    expect(hideResolvedAfterDays({ days: "10" })).toBe(10);
  });

  it("clamps a stored value into the property's range", () => {
    expect(hideResolvedAfterDays({ days: "-5" })).toBe(0);
    expect(hideResolvedAfterDays({ days: "99999" })).toBe(3650);
  });

  it("falls back to the declared window when the stored value is not a number", () => {
    expect(hideResolvedAfterDays({ days: "soon" })).toBe(4);
  });
});

describe("updatesWindowWeeks", () => {
  it("defaults to the declared window when the binding stored none", () => {
    expect(updatesWindowWeeks({})).toBe(2);
  });

  it("returns the stored window as a number", () => {
    expect(updatesWindowWeeks({ weeks: "6" })).toBe(6);
  });

  it("clamps a stored value into the property's range", () => {
    // A zero-week window would fetch nothing at all, and a year is as far back as the panel reaches.
    expect(updatesWindowWeeks({ weeks: "0" })).toBe(1);
    expect(updatesWindowWeeks({ weeks: "-4" })).toBe(1);
    expect(updatesWindowWeeks({ weeks: "99999" })).toBe(52);
  });

  it("falls back to the declared window when the stored value is not a number", () => {
    expect(updatesWindowWeeks({ weeks: "recently" })).toBe(2);
  });

  it("reads the same property key the binding form writes", () => {
    const property = projectTrackingViewType.properties.find((p) => p.key === "weeks");
    expect(property?.kind).toBe("number");
    expect(property?.defaultValue).toBe("2");
  });
});
