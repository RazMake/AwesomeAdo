import { afterEach, describe, expect, it } from "vitest";

import {
  AdoAccessBannerController,
  type AdoAccessBannerElements,
} from "./AdoAccessBannerController";

function makeElements(): AdoAccessBannerElements {
  const banner = document.createElement("div");
  const recheckButton = document.createElement("button");
  banner.append(recheckButton);
  document.body.append(banner);
  return { banner, recheckButton };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AdoAccessBannerController", () => {
  it("hides the banner and reports reachable when an ADO tab answers", async () => {
    const elements = makeElements();
    const controller = new AdoAccessBannerController(
      elements,
      () => Promise.resolve(true),
      () => {},
      () => {},
    );

    await expect(controller.init()).resolves.toBe(true);
    expect(elements.banner.hidden).toBe(true);
    controller.dispose();
  });

  it("shows the banner and reports unreachable when no ADO tab answers", async () => {
    const elements = makeElements();
    const controller = new AdoAccessBannerController(
      elements,
      () => Promise.resolve(false),
      () => {},
      () => {},
    );

    await expect(controller.init()).resolves.toBe(false);
    expect(elements.banner.hidden).toBe(false);
    controller.dispose();
  });

  it("treats a failed probe as a loss of access and reports it", async () => {
    const elements = makeElements();
    const errors: unknown[] = [];
    const controller = new AdoAccessBannerController(
      elements,
      () => Promise.reject(new Error("no tabs permission")),
      () => {},
      (error) => errors.push(error),
    );

    await expect(controller.init()).resolves.toBe(false);
    expect(elements.banner.hidden).toBe(false);
    expect(errors).toHaveLength(1);
    controller.dispose();
  });

  it("re-checks on request, and stops once disposed", async () => {
    const elements = makeElements();
    let rechecks = 0;
    const controller = new AdoAccessBannerController(
      elements,
      () => Promise.resolve(false),
      () => {
        rechecks += 1;
      },
      () => {},
    );
    await controller.init();

    elements.recheckButton.click();
    expect(rechecks).toBe(1);

    controller.dispose();
    elements.recheckButton.click();
    expect(rechecks).toBe(1);
  });
});
