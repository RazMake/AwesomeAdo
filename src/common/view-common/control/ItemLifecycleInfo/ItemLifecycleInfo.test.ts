import { describe, expect, it } from "vitest";

import type { TrackedUser } from "../../../ado/TrackedWorkItem";

import { renderItemLifecycleInfo } from "./ItemLifecycleInfo";

const alice: TrackedUser = {
  displayName: "Alice Doe",
  uniqueName: "alice@example.com",
  imageUrl: null,
};

describe("renderItemLifecycleInfo", () => {
  it("renders 'Created on:' with the formatted date", () => {
    const el = renderItemLifecycleInfo(document, {
      event: "created",
      timestamp: "2026-07-24T15:30:00Z",
      user: alice,
    });

    expect(el.textContent).toBe("Created on: 07/24/2026");
    expect(el.className).toBe("awesomeado-lifecycle");
  });

  it("renders 'Last Modified on:' for the last-modified event", () => {
    const el = renderItemLifecycleInfo(document, {
      event: "last-modified",
      timestamp: "2026-07-24T15:30:00Z",
      user: alice,
    });

    expect(el.textContent).toBe("Last Modified on: 07/24/2026");
  });

  it("puts a 'By {full name}' tooltip on the event word only", () => {
    const el = renderItemLifecycleInfo(document, {
      event: "created",
      timestamp: "2026-07-24T15:30:00Z",
      user: alice,
    });

    const eventLabel = el.querySelector<HTMLElement>(".awesomeado-lifecycle__event");
    expect(eventLabel?.title).toBe("By Alice Doe");
  });

  it("delegates the date tooltip to the DateLabel control ('@ time PST')", () => {
    const el = renderItemLifecycleInfo(document, {
      event: "created",
      timestamp: "2026-07-24T15:30:00Z",
      user: alice,
    });

    const dateLabel = el.querySelector<HTMLElement>(".awesomeado-date");
    expect(dateLabel?.title).toBe("@ 8:30 AM PST");
  });

  it("omits the actor tooltip when the user is null", () => {
    const el = renderItemLifecycleInfo(document, {
      event: "created",
      timestamp: "2026-07-24T15:30:00Z",
      user: null,
    });

    const eventLabel = el.querySelector<HTMLElement>(".awesomeado-lifecycle__event");
    expect(eventLabel?.title).toBe("");
  });

  it("shows the DateLabel dash for an invalid timestamp", () => {
    const el = renderItemLifecycleInfo(document, {
      event: "last-modified",
      timestamp: "not-a-date",
      user: alice,
    });

    expect(el.textContent).toBe("Last Modified on: —");
  });

  it("keeps a crafted display name inert in the tooltip", () => {
    const el = renderItemLifecycleInfo(document, {
      event: "created",
      timestamp: "2026-07-24T15:30:00Z",
      user: { displayName: "<img src=x onerror=alert(1)>", uniqueName: null, imageUrl: null },
    });

    // The name only ever lands in the title attribute; no element is parsed from it.
    expect(el.querySelector("img")).toBeNull();
    const eventLabel = el.querySelector<HTMLElement>(".awesomeado-lifecycle__event");
    expect(eventLabel?.title).toBe("By <img src=x onerror=alert(1)>");
  });

  it("inherits theme text color and font, muting only the label with opacity", () => {
    const el = renderItemLifecycleInfo(document, {
      event: "created",
      timestamp: "2026-07-24T15:30:00Z",
      user: alice,
    });

    expect(el.style.color).toBe("inherit");
    expect(el.style.font).toBe("inherit");
    // The root (and thus the date) stays full-strength; only the label is dimmed.
    expect(el.style.opacity).toBe("");
    const label = el.querySelector<HTMLElement>(".awesomeado-lifecycle__label");
    expect(label?.style.opacity).toBe("0.65");
    const dateLabel = el.querySelector<HTMLElement>(".awesomeado-date");
    expect(dateLabel?.style.opacity).toBe("");
  });
});
