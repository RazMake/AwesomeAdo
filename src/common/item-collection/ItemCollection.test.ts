import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../logging/ILogger";

import { type CollectedItem, ItemCollection } from "./ItemCollection";
import {
  isCollectProbe,
  markCollectProbe,
  markCollectProbeHandled,
  wasCollectProbeHandled,
} from "./collectProbe";
import {
  formatCollectedIds,
  formatCollectedLinksHtml,
  formatCollectedLinksText,
} from "./formatCollection";

function fakeLogger(): ILogger & { infos: string[]; errors: unknown[] } {
  const infos: string[] = [];
  const errors: unknown[] = [];
  return {
    infos,
    errors,
    info: (message) => infos.push(message),
    error: (_message, error) => errors.push(error),
  };
}

const FEATURE: CollectedItem = {
  id: 7,
  title: 'Ship <it> & "go"',
  type: "Feature",
  url: "https://dev.azure.com/o/p/_workitems/edit/7",
};
const BUG: CollectedItem = { id: 9, title: "Crash", type: "Bug", url: null };

describe("ItemCollection lifecycle", () => {
  it("starts inactive and ignores toggles until started", () => {
    const logger = fakeLogger();
    const collection = new ItemCollection(logger);
    collection.toggle(FEATURE);
    expect(collection.isActive).toBe(false);
    expect(collection.items()).toEqual([]);
    expect(logger.infos.at(-1)).toContain("no collection is running");
  });

  it("notifies on start and end, and ignores repeated starts and ends", () => {
    const collection = new ItemCollection(fakeLogger());
    const listener = vi.fn();
    collection.subscribe(listener);
    collection.start();
    collection.start();
    collection.end();
    collection.end();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("drops every item when the collection ends", () => {
    const logger = fakeLogger();
    const collection = new ItemCollection(logger);
    collection.start();
    collection.toggle(FEATURE);
    collection.end();
    expect(collection.items()).toEqual([]);
    expect(collection.has(FEATURE.id)).toBe(false);
    expect(logger.infos.at(-1)).toBe("Work item collection ended with 1 item(s).");
  });

  it("stops notifying an unsubscribed listener", () => {
    const collection = new ItemCollection(fakeLogger());
    const listener = vi.fn();
    collection.subscribe(listener)();
    collection.start();
    expect(listener).not.toHaveBeenCalled();
  });

  it("logs a failing listener and still notifies the rest", () => {
    const logger = fakeLogger();
    const collection = new ItemCollection(logger);
    const failure = new Error("boom");
    const after = vi.fn();
    collection.subscribe(() => {
      throw failure;
    });
    collection.subscribe(after);
    collection.start();
    expect(after).toHaveBeenCalledOnce();
    expect(logger.errors).toEqual([failure]);
  });
});

describe("ItemCollection contents", () => {
  it("toggles items in and out, keeping collection order", () => {
    const collection = new ItemCollection(fakeLogger());
    collection.start();
    collection.toggle(FEATURE);
    collection.toggle(BUG);
    expect(collection.items().map((item) => item.id)).toEqual([7, 9]);
    collection.toggle(FEATURE);
    expect(collection.items()).toEqual([BUG]);
    expect(collection.has(BUG.id)).toBe(true);
  });

  it("removes by id and notifies only when something was removed", () => {
    const collection = new ItemCollection(fakeLogger());
    collection.start();
    collection.toggle(FEATURE);
    const listener = vi.fn();
    collection.subscribe(listener);
    collection.remove(123);
    expect(listener).not.toHaveBeenCalled();
    collection.remove(FEATURE.id);
    expect(listener).toHaveBeenCalledOnce();
    expect(collection.items()).toEqual([]);
  });
});

describe("ItemCollection restore", () => {
  it("continues a stored collection, logging only when it starts running", () => {
    const logger = fakeLogger();
    const collection = new ItemCollection(logger);
    const listener = vi.fn();
    collection.subscribe(listener);
    collection.restore({ items: [FEATURE] });
    collection.restore({ items: [FEATURE, BUG] });
    expect(collection.isActive).toBe(true);
    expect(collection.items()).toEqual([FEATURE, BUG]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(logger.infos).toEqual([
      "Work item collection continued from another tab or device with 1 item(s).",
    ]);
  });

  it("ignores a restore that changes nothing", () => {
    const collection = new ItemCollection(fakeLogger());
    collection.start();
    collection.toggle(FEATURE);
    const listener = vi.fn();
    collection.subscribe(listener);
    collection.restore({ items: [{ ...FEATURE }] });
    collection.restore({ items: [{ ...FEATURE, title: "Renamed" }] });
    expect(listener).toHaveBeenCalledOnce();
    expect(collection.items()[0]?.title).toBe("Renamed");
  });

  it("ends when the stored collection ended, and ignores that while inactive", () => {
    const logger = fakeLogger();
    const collection = new ItemCollection(logger);
    const listener = vi.fn();
    collection.subscribe(listener);
    collection.restore(null);
    expect(listener).not.toHaveBeenCalled();
    collection.restore({ items: [BUG] });
    collection.restore(null);
    expect(collection.isActive).toBe(false);
    expect(collection.items()).toEqual([]);
    expect(logger.infos.at(-1)).toBe("Work item collection ended in another tab or device.");
  });
});

describe("formatCollection", () => {
  it("joins ids with commas", () => {
    expect(formatCollectedIds([FEATURE, BUG])).toBe("7, 9");
  });

  it("writes one plain-text line per item with its link when known", () => {
    expect(formatCollectedLinksText([FEATURE, BUG])).toBe(
      `#7 Feature Ship <it> & "go" - ${FEATURE.url}\n#9 Bug Crash`,
    );
  });

  it("writes escaped HTML with each id linked when a URL is known", () => {
    expect(formatCollectedLinksHtml([FEATURE, BUG])).toBe(
      `<a href="${FEATURE.url}">#7</a> Feature Ship &lt;it&gt; &amp; &quot;go&quot;<br>#9 Bug Crash`,
    );
  });
});

describe("collectProbe", () => {
  it("marks probes and their handling independently", () => {
    const event = new Event("contextmenu");
    expect(isCollectProbe(event)).toBe(false);
    markCollectProbe(event);
    expect(isCollectProbe(event)).toBe(true);
    expect(wasCollectProbeHandled(event)).toBe(false);
    markCollectProbeHandled(event);
    expect(wasCollectProbeHandled(event)).toBe(true);
  });

  it("only spends a click for an event that was marked as a probe", () => {
    const event = new Event("contextmenu");
    markCollectProbeHandled(event);
    expect(wasCollectProbeHandled(event)).toBe(false);
  });

  it("is recognised across separately bundled copies of the module", async () => {
    // Deferred views ship as their own bundles, each with a private copy of this module.
    vi.resetModules();
    const otherBundle = await import("./collectProbe");
    expect(otherBundle.markCollectProbe).not.toBe(markCollectProbe);
    const event = new Event("contextmenu");
    markCollectProbe(event);
    expect(otherBundle.isCollectProbe(event)).toBe(true);
    otherBundle.markCollectProbeHandled(event);
    expect(wasCollectProbeHandled(event)).toBe(true);
  });
});
