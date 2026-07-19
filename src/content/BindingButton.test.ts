import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BindingButton } from "./BindingButton";

// MutationObserver callbacks are delivered on a microtask after the mutation; yielding to a
// macrotask guarantees any pending observer callback has run before we assert.
const flushMutations = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("BindingButton", () => {
  let button: BindingButton;

  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    button = new BindingButton(
      document,
      "chrome-extension://abc/icons/icon.svg",
      "Enhance with AwesomeADO",
    );
  });

  // Disconnect the persistence observer so it can't re-insert a stale button into the next test.
  afterEach(() => {
    button.hide();
  });

  it("injects an icon button labelled for accessibility on show", () => {
    button.show(vi.fn());

    const injected = document.querySelector<HTMLButtonElement>("#awesomeado-enhance-button");
    expect(injected).not.toBeNull();
    expect(injected?.type).toBe("button");
    // The purpose is conveyed by the accessible name / tooltip, not visible text.
    expect(injected?.title).toBe("Enhance with AwesomeADO");
    expect(injected?.getAttribute("aria-label")).toBe("Enhance with AwesomeADO");
    const icon = injected?.querySelector<HTMLImageElement>("img");
    expect(icon?.getAttribute("src")).toBe("chrome-extension://abc/icons/icon.svg");
    expect(icon?.alt).toBe("Enhance with AwesomeADO");
  });

  it("adds the button as the first item of the top-bar command menubar when present", () => {
    // Mirror ADO's header: a navigation region ending with the search box, followed by the command
    // menubar. The button must join the menubar (left of the native icons) so it shares the
    // container that paints the header's bottom line and never leaves a gap in it.
    const row = document.createElement("div");
    const nav = document.createElement("div");
    nav.setAttribute("role", "navigation");
    const searchBox = document.createElement("div");
    searchBox.setAttribute("role", "search");
    nav.append(searchBox);
    const menubar = document.createElement("div");
    menubar.className = "region-header-menubar";
    menubar.append(document.createElement("button"));
    row.append(nav, menubar);
    document.body.append(row);

    button.show(vi.fn());

    const injected = document.querySelector<HTMLButtonElement>("#awesomeado-enhance-button");
    expect(menubar.firstElementChild).toBe(injected);
    // Styled like ADO's native command buttons (a rounded square, not a floating circle).
    expect(injected?.style.borderRadius).toBe("2px");
    expect(injected?.style.position).not.toBe("fixed");
  });

  it("falls back to after the navigation region when there is no command menubar", () => {
    // Mirrors ADO's top bar: the search box lives at the end of the navigation region, whose own
    // wrapper is sized to the input. The button must land after the region, not beside the input.
    const nav = document.createElement("div");
    nav.setAttribute("role", "navigation");
    const searchBox = document.createElement("div");
    searchBox.setAttribute("role", "search");
    nav.append(searchBox);
    document.body.append(nav);

    button.show(vi.fn());

    const injected = document.querySelector<HTMLButtonElement>("#awesomeado-enhance-button");
    expect(nav.nextElementSibling).toBe(injected);
    // Anchored into the top-bar flow, not floated as an overlay.
    expect(injected?.style.position).not.toBe("fixed");
  });

  it("inserts the button after the search box itself when it has no navigation region", () => {
    const searchBox = document.createElement("div");
    searchBox.setAttribute("role", "search");
    document.body.append(searchBox);

    button.show(vi.fn());

    const injected = document.querySelector<HTMLButtonElement>("#awesomeado-enhance-button");
    expect(searchBox.nextElementSibling).toBe(injected);
    expect(injected?.style.position).not.toBe("fixed");
  });

  it("falls back to a fixed top-right overlay when no search box is present", () => {
    button.show(vi.fn());

    const injected = document.querySelector<HTMLButtonElement>("#awesomeado-enhance-button");
    expect(injected?.parentElement).toBe(document.body);
    // Fixed overlay so it stays visible above ADO's own top bar even without an anchor.
    expect(injected?.style.position).toBe("fixed");
  });

  it("runs the click handler with the button as its anchor when clicked", () => {
    const onClick = vi.fn();
    button.show(onClick);
    const injected = document.querySelector<HTMLButtonElement>("#awesomeado-enhance-button");

    injected?.click();

    expect(onClick).toHaveBeenCalledTimes(1);
    // The handler is handed the button element so callers can anchor a menu to it.
    expect(onClick).toHaveBeenCalledWith(injected);
  });

  it("highlights on hover and clears the highlight when the pointer leaves", () => {
    button.show(vi.fn());
    const injected = document.querySelector<HTMLButtonElement>("#awesomeado-enhance-button");

    injected?.dispatchEvent(new MouseEvent("mouseenter"));
    expect(injected?.style.backgroundColor).not.toBe("transparent");

    injected?.dispatchEvent(new MouseEvent("mouseleave"));
    expect(injected?.style.backgroundColor).toBe("transparent");
  });

  it("does not inject a second button when already shown", () => {
    button.show(vi.fn());
    button.show(vi.fn());

    expect(document.querySelectorAll("#awesomeado-enhance-button")).toHaveLength(1);
  });

  it("removes the button and detaches its handler on hide", () => {
    const onClick = vi.fn();
    button.show(onClick);
    const injected = document.querySelector<HTMLButtonElement>("#awesomeado-enhance-button");

    button.hide();

    expect(document.querySelector("#awesomeado-enhance-button")).toBeNull();
    // The removed element must no longer trigger the handler.
    injected?.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is safe to hide when nothing is shown", () => {
    expect(() => button.hide()).not.toThrow();
  });

  it("can be shown again after being hidden, using a fresh handler", () => {
    const first = vi.fn();
    const second = vi.fn();
    button.show(first);
    button.hide();
    button.show(second);

    document.querySelector<HTMLButtonElement>("#awesomeado-enhance-button")?.click();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("re-attaches itself when Azure DevOps removes it from the DOM", async () => {
    const onClick = vi.fn();
    button.show(onClick);
    const injected = document.querySelector<HTMLButtonElement>("#awesomeado-enhance-button");

    // Simulate ADO's header re-render dropping our injected node.
    injected?.remove();
    await flushMutations();

    const readded = document.querySelector<HTMLButtonElement>("#awesomeado-enhance-button");
    expect(readded).not.toBeNull();
    // The same node is re-attached, so its click handler is preserved.
    readded?.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("stops re-attaching once hidden", async () => {
    button.show(vi.fn());
    button.hide();

    // A later DOM mutation must not resurrect the button after an intentional hide.
    document.body.append(document.createElement("div"));
    await flushMutations();

    expect(document.querySelector("#awesomeado-enhance-button")).toBeNull();
  });
});
