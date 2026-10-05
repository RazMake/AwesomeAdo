import { describe, expect, it } from "vitest";

import {
  consumersSearchWithAreaPaths,
  consumersSearchWithConsumerIds,
  readConsumersUrlAreaPaths,
  readConsumersUrlConsumerIds,
} from "./consumersUrlPreferences";
import { consumersViewType, orderingPolicyOf, requestAreaPaths } from "./consumersViewType";

describe("consumersViewType", () => {
  it("reads the configured request area paths, one per line", () => {
    expect(requestAreaPaths({ requestAreaPaths: "Contoso\\Team A\n  \nContoso\\Team B" })).toEqual([
      "Contoso\\Team A",
      "Contoso\\Team B",
    ]);
  });

  it("lets every request through when no area path is configured", () => {
    expect(requestAreaPaths({})).toEqual([]);
  });

  it("falls back to the legacy consumer area paths key only when the new key is absent", () => {
    expect(requestAreaPaths({ consumerAreaPaths: "Contoso\\Legacy" })).toEqual(["Contoso\\Legacy"]);
    expect(
      requestAreaPaths({ requestAreaPaths: "Contoso\\New", consumerAreaPaths: "Contoso\\Legacy" }),
    ).toEqual(["Contoso\\New"]);
  });

  it("treats an explicitly empty new key as no filter, ignoring the legacy key", () => {
    expect(
      requestAreaPaths({ requestAreaPaths: "", consumerAreaPaths: "Contoso\\Legacy" }),
    ).toEqual([]);
  });

  it("offers only the drag order and ETA order, reading anything else as the drag order", () => {
    expect(orderingPolicyOf({ orderingPolicy: "eta" })).toBe("eta");
    expect(orderingPolicyOf({ orderingPolicy: "title" })).toBe("importance");
    expect(orderingPolicyOf({})).toBe("importance");
    expect(consumersViewType.properties[0]?.options?.map((option) => option.label)).toEqual([
      "Drag-and-drop order",
      "By ETA (past/recent - future)",
    ]);
    expect(consumersViewType.properties.map((property) => property.key)).toEqual([
      "orderingPolicy",
      "requestAreaPaths",
    ]);
  });
});

describe("consumers URL area paths", () => {
  it("reads repeated, trimmed, de-duplicated area paths", () => {
    expect(
      readConsumersUrlAreaPaths("?areaPath=A%5CB&areaPath=%20C%20&areaPath=A%5CB&areaPath="),
    ).toEqual(["A\\B", "C"]);
  });

  it("writes the selection while keeping every other parameter", () => {
    expect(consumersSearchWithAreaPaths("?_a=query&areaPath=Old", ["A\\B", "C D"])).toBe(
      "?_a=query&areaPath=A%5CB&areaPath=C+D",
    );
  });

  it("drops the parameter, and the question mark with it, for an empty selection", () => {
    expect(consumersSearchWithAreaPaths("?areaPath=Old", [])).toBe("");
    expect(consumersSearchWithAreaPaths("?_a=query&areaPath=Old", [])).toBe("?_a=query");
  });

  it("round-trips what it writes", () => {
    const paths = ["Contoso\\Team A", "Contoso\\Team & Co"];
    expect(readConsumersUrlAreaPaths(consumersSearchWithAreaPaths("", paths))).toEqual(paths);
  });
});

describe("consumers URL consumer ids", () => {
  it("reads repeated, de-duplicated positive ids and ignores anything else", () => {
    expect(
      readConsumersUrlConsumerIds("?consumer=7&consumer=%203%20&consumer=7&consumer=x&consumer=0"),
    ).toEqual([7, 3]);
  });

  it("writes the selection beside other parameters and drops it when empty", () => {
    expect(consumersSearchWithConsumerIds("?_a=query&consumer=1", [4, 5])).toBe(
      "?_a=query&consumer=4&consumer=5",
    );
    expect(consumersSearchWithConsumerIds("?consumer=1", [])).toBe("");
  });
});
