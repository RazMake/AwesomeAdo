import { describe, expect, it } from "vitest";

import { consumersSearchWithAreaPaths, readConsumersUrlAreaPaths } from "./consumersUrlPreferences";
import { consumerAreaPaths, consumersViewType, orderingPolicyOf } from "./consumersViewType";

describe("consumersViewType", () => {
  it("reads the configured consumer area paths, one per line", () => {
    expect(
      consumerAreaPaths({ consumerAreaPaths: "Contoso\\Team A\n  \nContoso\\Team B" }),
    ).toEqual(["Contoso\\Team A", "Contoso\\Team B"]);
  });

  it("lets every consumer through when no area path is configured", () => {
    expect(consumerAreaPaths({})).toEqual([]);
  });

  it("reads the binding's ordering policy through the shared property", () => {
    expect(orderingPolicyOf({ orderingPolicy: "title" })).toBe("title");
    expect(consumersViewType.properties.map((property) => property.key)).toEqual([
      "orderingPolicy",
      "consumerAreaPaths",
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
