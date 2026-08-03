import { describe, expect, it } from "vitest";

import { renderVersionLabel } from "./VersionLabel";

describe("renderVersionLabel", () => {
  it("shows only the Major.Minor release, in bold", () => {
    // The build segment is CI's run counter; it names no version anyone can install, so putting it
    // on screen would only produce bug reports against a version that was never published.
    const label = renderVersionLabel(document, "0.3.42");

    expect(label.textContent).toBe("v 0.3");
    expect(label.querySelector("strong")?.textContent).toBe("0.3");
    expect(label.querySelector("em")).toBeNull();
  });

  it("announces the same release it shows", () => {
    const label = renderVersionLabel(document, "0.3.42");

    expect(label.getAttribute("aria-label")).toContain("AwesomeADO version 0.3");
  });

  it("opens the Edge Add-ons listing, in a tab that cannot reach back into the ADO page", () => {
    const label = renderVersionLabel(document, "0.3.42");

    expect(label.tagName).toBe("A");
    expect(label.href).toBe(
      "https://microsoftedge.microsoft.com/addons/detail/hecfalbmicpkbklpfhipflpopnaikfbb",
    );
    expect(label.target).toBe("_blank");
    // Without `noopener` the opened tab could steer the ADO page this marker is injected into.
    expect(label.rel).toBe("noopener noreferrer");
    expect(label.title.length).toBeGreaterThan(0);
  });

  it("reads a version that carries no build segment at all", () => {
    expect(renderVersionLabel(document, "1.7").textContent).toBe("v 1.7");
  });

  it("completes a bare major into a Major.Minor rather than showing half a version", () => {
    expect(renderVersionLabel(document, "2").textContent).toBe("v 2.0");
  });

  it("uses the themed secondary foreground as a discreet treatment", () => {
    const label = renderVersionLabel(document, "0.3.42");

    expect(label.style.color).toContain("var(--text-secondary-color");
    expect(label.style.fontSize).toBe("11px");
  });
});
