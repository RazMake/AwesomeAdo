import { describe, expect, it, vi } from "vitest";

import { ADO_NAVIGATION_MESSAGE } from "./AdoQueryRoute";
import { notifyNavigation } from "./NavigationNotifier";
import type { NavigationDetails, NavigationMessageSender } from "./NavigationNotifier";

function makeDetails(overrides: Partial<NavigationDetails> = {}): NavigationDetails {
  return {
    tabId: 1,
    frameId: 0,
    url: "https://dev.azure.com/org/_queries",
    documentId: "doc-abc",
    ...overrides,
  };
}

describe("notifyNavigation", () => {
  it("calls the sender once for a top-frame navigation", async () => {
    const sender = vi.fn<NavigationMessageSender>().mockResolvedValue(undefined);
    await notifyNavigation(makeDetails(), sender);
    expect(sender).toHaveBeenCalledOnce();
  });

  it("passes the correct tabId to the sender", async () => {
    const sender = vi.fn<NavigationMessageSender>().mockResolvedValue(undefined);
    await notifyNavigation(makeDetails({ tabId: 42 }), sender);
    expect(sender.mock.calls[0]?.[0]).toBe(42);
  });

  it("passes the correct ADO navigation message", async () => {
    const sender = vi.fn<NavigationMessageSender>().mockResolvedValue(undefined);
    const url = "https://dev.azure.com/org/_queries";
    await notifyNavigation(makeDetails({ url }), sender);
    expect(sender.mock.calls[0]?.[1]).toEqual({
      type: ADO_NAVIGATION_MESSAGE,
      url,
    });
  });

  it("passes the exact documentId in the options", async () => {
    const sender = vi.fn<NavigationMessageSender>().mockResolvedValue(undefined);
    await notifyNavigation(makeDetails({ documentId: "specific-doc-id" }), sender);
    expect(sender.mock.calls[0]?.[2]).toEqual({ documentId: "specific-doc-id" });
  });

  it("does not call the sender for a subframe navigation (frameId != 0)", async () => {
    const sender = vi.fn<NavigationMessageSender>().mockResolvedValue(undefined);
    await notifyNavigation(makeDetails({ frameId: 1 }), sender);
    expect(sender).not.toHaveBeenCalled();
  });

  it("does not call the sender for a deep subframe (frameId > 1)", async () => {
    const sender = vi.fn<NavigationMessageSender>().mockResolvedValue(undefined);
    await notifyNavigation(makeDetails({ frameId: 99 }), sender);
    expect(sender).not.toHaveBeenCalled();
  });

  it("resolves harmlessly when the sender rejects (no-receiver scenario)", async () => {
    const sender = vi
      .fn<NavigationMessageSender>()
      .mockRejectedValue(
        new Error("Could not establish connection. Receiving end does not exist."),
      );
    await expect(notifyNavigation(makeDetails(), sender)).resolves.toBeUndefined();
  });

  it("does not throw or propagate when sender throws synchronously", async () => {
    // In practice fetch or chrome.tabs.sendMessage may throw synchronously in some edge cases
    const sender: NavigationMessageSender = () => {
      throw new Error("sync error");
    };
    await expect(notifyNavigation(makeDetails(), sender)).resolves.toBeUndefined();
  });
});
