import { afterEach, describe, expect, it, vi } from "vitest";

import { DARK_THEME } from "../../common/view-common/themes/darkTheme";
import { LIGHT_THEME } from "../../common/view-common/themes/lightTheme";

import { SESSION_EXPIRED_TEXT, SessionExpiredBanner } from "./SessionExpiredBanner";

const SHOWN_LOG = "Showing the Azure DevOps sign-in expired banner.";
const HIDDEN_LOG = "Hid the Azure DevOps sign-in expired banner.";

function createBanner() {
  const openSignIn = vi.fn();
  const logger = { info: vi.fn<(message: string) => void>(), error: vi.fn() };
  const banner = new SessionExpiredBanner(document, openSignIn, logger);
  return { banner, openSignIn, logger };
}

function bannerRoot(): HTMLElement | null {
  return document.getElementById("awesomeado-session-banner");
}

function bannerButton(label: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(
    `#awesomeado-session-banner button[aria-label="${label}"]`,
  )!;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
});

describe("SessionExpiredBanner visibility", () => {
  it("starts hidden", () => {
    const { banner } = createBanner();

    expect(banner.isShown).toBe(false);
    expect(bannerRoot()).toBeNull();
  });

  it("shows one alert on the page body however often it is shown, logging once", () => {
    const { banner, logger } = createBanner();

    banner.show();
    banner.show();

    const roots = document.body.querySelectorAll("#awesomeado-session-banner");
    expect(roots).toHaveLength(1);
    expect(roots[0]!.parentElement).toBe(document.body);
    expect(roots[0]!.getAttribute("role")).toBe("alert");
    expect(roots[0]!.textContent).toContain(SESSION_EXPIRED_TEXT);
    expect(banner.isShown).toBe(true);
    expect(logger.info.mock.calls).toEqual([[SHOWN_LOG]]);
  });

  it("removes the alert however often it is hidden, logging once", () => {
    const { banner, logger } = createBanner();
    banner.show();

    banner.hide();
    banner.hide();

    expect(bannerRoot()).toBeNull();
    expect(banner.isShown).toBe(false);
    expect(logger.info.mock.calls).toEqual([[SHOWN_LOG], [HIDDEN_LOG]]);
  });

  it("does not log hiding a banner that was never shown", () => {
    const { banner, logger } = createBanner();

    banner.hide();

    expect(logger.info).not.toHaveBeenCalled();
  });

  it("can be shown again after it was hidden", () => {
    const { banner } = createBanner();
    banner.show();
    banner.hide();

    banner.show();

    expect(bannerRoot()).not.toBeNull();
    expect(banner.isShown).toBe(true);
  });
});

describe("SessionExpiredBanner buttons", () => {
  it("opens the sign-in from the Sign in button and keeps the banner up", () => {
    const { banner, openSignIn, logger } = createBanner();
    banner.show();

    const signIn = bannerButton("Open the Azure DevOps sign-in in a new tab");
    expect(signIn.textContent).toBe("Sign in");
    expect(signIn.type).toBe("button");
    signIn.click();

    expect(openSignIn).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenLastCalledWith(
      "Sign-in banner: opening the Azure DevOps sign-in in a new tab.",
    );
    expect(banner.isShown).toBe(true);
  });

  it("hides the banner from the dismiss button without opening the sign-in", () => {
    const { banner, openSignIn, logger } = createBanner();
    banner.show();

    const dismiss = bannerButton("Dismiss");
    expect(dismiss.textContent).toBe("×");
    dismiss.click();

    expect(banner.isShown).toBe(false);
    expect(bannerRoot()).toBeNull();
    expect(openSignIn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenLastCalledWith(HIDDEN_LOG);
  });
});

describe("SessionExpiredBanner theme", () => {
  it("follows the theme ADO is painting by default", () => {
    document.body.style.setProperty("--background-color", "rgb(255, 255, 255)");
    const { banner } = createBanner();

    banner.show();

    expect(bannerRoot()!.style.getPropertyValue("--accent")).toBe(LIGHT_THEME.colors["--accent"]);
    expect(bannerRoot()!.style.getPropertyValue("color-scheme")).toBe("light");
  });

  it("applies a theme chosen before it is shown", () => {
    const { banner } = createBanner();

    banner.applyTheme("light");
    banner.show();

    expect(bannerRoot()!.style.getPropertyValue("--accent")).toBe(LIGHT_THEME.colors["--accent"]);
    expect(bannerRoot()!.style.getPropertyValue("color-scheme")).toBe("light");
  });

  it("re-themes the banner while it is shown", () => {
    const { banner } = createBanner();
    banner.applyTheme("light");
    banner.show();

    banner.applyTheme("dark");

    expect(bannerRoot()!.style.getPropertyValue("--accent")).toBe(DARK_THEME.colors["--accent"]);
    expect(bannerRoot()!.style.getPropertyValue("color-scheme")).toBe("dark");
  });

  it("keeps the latest theme for the next time it is shown", () => {
    const { banner } = createBanner();
    banner.show();
    banner.hide();

    banner.applyTheme("dark");
    banner.show();

    expect(bannerRoot()!.style.getPropertyValue("color-scheme")).toBe("dark");
  });
});
