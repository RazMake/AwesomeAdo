import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EnhancedViewServices } from "../../common/view-common/EnhancedView";

import { EnhancedViewSurface, type EnhancedViewRequest } from "./EnhancedViewSurface";

const STYLE_ID = "awesomeado-enhanced-view-style";
const HOST_ID = "awesomeado-enhanced-view";

// Let queued MutationObserver callbacks (the keep-alive re-attach) run before asserting.
const flushMutations = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const sprint: EnhancedViewRequest = { viewId: "sprint", queryId: "q1", properties: {} };
const tracking: EnhancedViewRequest = {
  viewId: "projectTracking",
  queryId: "q1",
  properties: {},
};

const styleEl = (): HTMLElement | null => document.getElementById(STYLE_ID);
const hostEl = (): HTMLElement | null => document.getElementById(HOST_ID);
const titleText = (): string | null =>
  document.querySelector(`#${HOST_ID} .awesomeado-view__title`)?.textContent ?? null;

describe("EnhancedViewSurface", () => {
  let surface: EnhancedViewSurface;

  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    surface = new EnhancedViewSurface(document);
  });

  afterEach(() => {
    // Disconnect the keep-alive observer so it never leaks into the next test.
    surface.apply(null);
  });

  it("does nothing when applied with null before anything is shown", () => {
    surface.apply(null);
    expect(styleEl()).toBeNull();
    expect(hostEl()).toBeNull();
  });

  it("hides only the main landmark and paints ADO's theme background when a view is shown", () => {
    surface.apply(sprint);

    const style = styleEl();
    expect(style).toBeTruthy();
    expect(style?.textContent).toContain('[role="main"]');
    // visibility (not display:none) so the landmark stays measurable for the overlay to track.
    expect(style?.textContent).toContain("visibility: hidden");
    expect(style?.textContent).not.toContain("body > *");
    expect(style?.textContent).toContain("background: var(--background-color, #fff)");
  });

  it("pins the host to ADO's content region so the breadcrumb bar and left rail both stay visible", () => {
    // Give ADO a content landmark whose top/left mark the breadcrumb bar's height and rail's width.
    const main = document.createElement("main");
    main.setAttribute("role", "main");
    main.getBoundingClientRect = () => ({ top: 96, left: 44, width: 800, height: 600 }) as DOMRect;
    document.body.append(main);

    surface.apply(sprint);

    const host = hostEl();
    expect(host?.style.position).toBe("fixed");
    expect(host?.style.right).toBe("0px");
    expect(host?.style.bottom).toBe("0px");
    // Starts under the breadcrumb bar and right of the left rail so both survive the view change.
    expect(host?.style.top).toBe("96px");
    expect(host?.style.left).toBe("44px");
  });

  it("follows ADO's content region when the collapsible left rail changes width", async () => {
    const main = document.createElement("main");
    main.setAttribute("role", "main");
    let box = { top: 96, left: 44, width: 800, height: 600 };
    main.getBoundingClientRect = () => box as DOMRect;
    document.body.append(main);
    surface.apply(sprint);
    expect(hostEl()?.style.left).toBe("44px");

    // The rail expands: the content region's left edge moves right and the overlay must follow it
    // instead of leaving the widened rail peeking out from under the view.
    box = { top: 96, left: 220, width: 624, height: 600 };
    document.body.append(document.createElement("span"));
    await flushMutations();

    expect(hostEl()?.style.left).toBe("220px");
  });

  it("covers the whole window when ADO's content region cannot be measured yet", () => {
    // With no measurable landmark the overlay falls back to the top-left of the viewport.
    surface.apply(sprint);

    expect(hostEl()?.style.position).toBe("fixed");
    expect(hostEl()?.style.top).toBe("0px");
    expect(hostEl()?.style.left).toBe("0px");
  });

  it("mounts a host that renders the requested view's own text", () => {
    surface.apply(sprint);

    expect(hostEl()).toBeTruthy();
    expect(titleText()).toBe("Sprint View");
  });

  it("shows different text for a different view type", () => {
    surface.apply(sprint);
    expect(titleText()).toBe("Sprint View");

    surface.apply(tracking);
    expect(titleText()).toBe("Project Tracking");
    // Swapping views replaces the content rather than stacking it.
    expect(document.querySelectorAll(`#${HOST_ID} .awesomeado-view__title`)).toHaveLength(1);
  });

  it("does not re-render when the same request is applied again", () => {
    surface.apply(sprint);
    const firstNode = hostEl()?.firstElementChild;

    surface.apply(sprint);
    // The unchanged signature keeps the previously rendered node in place (no rebuild each refresh).
    expect(hostEl()?.firstElementChild).toBe(firstNode);
  });

  it("re-renders when the host was emptied even if the request is unchanged", () => {
    surface.apply(sprint);
    const host = hostEl();
    if (host) {
      host.textContent = "";
    }

    surface.apply(sprint);
    expect(titleText()).toBe("Sprint View");
  });

  it("re-renders when a per-query property value changes", () => {
    surface.apply({ viewId: "sprint", queryId: "q1", properties: { a: "1" } });
    const firstNode = hostEl()?.firstElementChild;

    surface.apply({ viewId: "sprint", queryId: "q1", properties: { a: "2" } });
    expect(hostEl()?.firstElementChild).not.toBe(firstNode);
  });

  it("leaves ADO's own page in place for an unknown view id", () => {
    surface.apply({ viewId: "from-a-newer-build", queryId: "q1", properties: {} });

    expect(styleEl()).toBeNull();
    expect(hostEl()).toBeNull();
  });

  it("restores ADO by removing both the style and the host", () => {
    surface.apply(sprint);
    expect(styleEl()).toBeTruthy();
    expect(hostEl()).toBeTruthy();

    surface.apply(null);
    expect(styleEl()).toBeNull();
    expect(hostEl()).toBeNull();
  });

  it("re-attaches the host after ADO's re-render drops it", async () => {
    surface.apply(sprint);
    hostEl()?.remove();
    expect(hostEl()).toBeNull();

    await flushMutations();
    expect(hostEl()).toBeTruthy();
    expect(titleText()).toBe("Sprint View");
  });

  it("re-attaches the style after ADO's re-render drops it", async () => {
    surface.apply(sprint);
    styleEl()?.remove();
    expect(styleEl()).toBeNull();

    await flushMutations();
    expect(styleEl()).toBeTruthy();
  });

  it("stops re-attaching once restored", async () => {
    surface.apply(sprint);
    surface.apply(null);

    // A later DOM mutation must not resurrect the removed surface.
    document.body.append(document.createElement("span"));
    await flushMutations();
    expect(styleEl()).toBeNull();
    expect(hostEl()).toBeNull();
  });

  it("leaves a host-owned style with a different id untouched", () => {
    const foreign = document.createElement("style");
    foreign.id = "ado-owned-style";
    document.head.append(foreign);

    surface.apply(sprint);

    expect(document.getElementById("ado-owned-style")).toBe(foreign);
    expect(styleEl()).toBeTruthy();
  });

  it("forwards injected services to rendered views without breaking apply/restore", () => {
    // A minimal fake services object — views that don't use services ignore it.
    const fakeServices: EnhancedViewServices = {
      loadTree: () => Promise.resolve({ isTreeQuery: true, roots: [], error: null }),
      featureCrew: { reconcile: () => Promise.resolve({ ok: true, changed: false }) },
      userDirectory: { search: () => Promise.resolve([]), resolve: () => Promise.resolve(null) },
      getTypes: () => [],
      getBoardColumns: () => [],
      loadSprintWindow: () => Promise.resolve({ entries: [], currentName: null }),
      now: () => new Date(),
      logger: { info: () => {}, error: () => {} },
      writeState: () => Promise.resolve({ ok: true }),
    };
    const surfaceWithServices = new EnhancedViewSurface(document, fakeServices);

    // The surface with services should still apply/restore correctly.
    surfaceWithServices.apply(sprint);
    expect(styleEl()).toBeTruthy();
    expect(hostEl()).toBeTruthy();
    expect(titleText()).toBe("Sprint View");

    surfaceWithServices.apply(tracking);
    expect(titleText()).toBe("Project Tracking");

    surfaceWithServices.apply(null);
    expect(styleEl()).toBeNull();
    expect(hostEl()).toBeNull();
  });

  it("pins the chosen theme's tokens on the host so every control follows it", () => {
    surface.applyTheme("dark");
    surface.apply(sprint);

    const host = hostEl();
    expect(host?.style.getPropertyValue("--text-primary-color")).toBe("#e6e6e6");
    expect(host?.style.getPropertyValue("--background-color")).toBe("#1f1f1f");
  });

  it("re-themes an already-showing view immediately, without rebuilding its DOM", () => {
    surface.apply(sprint);
    const firstNode = hostEl()?.firstElementChild;

    surface.applyTheme("blue");

    const host = hostEl();
    expect(host?.style.getPropertyValue("--text-primary-color")).toBe("#10233b");
    // A theme change must not tear down and rebuild the rendered view.
    expect(host?.firstElementChild).toBe(firstNode);
  });

  it("clears pinned tokens for 'auto' so controls inherit ADO's own theme", () => {
    surface.applyTheme("light");
    surface.apply(sprint);
    expect(hostEl()?.style.getPropertyValue("--text-primary-color")).toBe("#1f1f1f");

    surface.applyTheme("auto");
    expect(hostEl()?.style.getPropertyValue("--text-primary-color")).toBe("");
    expect(hostEl()?.style.getPropertyValue("--background-color")).toBe("");
  });

  it("restores the pinned theme after ADO's re-render drops and re-attaches the host", async () => {
    surface.applyTheme("dark");
    surface.apply(sprint);
    hostEl()?.remove();

    await flushMutations();
    expect(hostEl()?.style.getPropertyValue("--text-primary-color")).toBe("#e6e6e6");
  });
});
