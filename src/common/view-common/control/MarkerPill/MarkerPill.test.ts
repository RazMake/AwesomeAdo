import { describe, expect, it, vi } from "vitest";

import { markerLabel, renderMarkerPill } from "./MarkerPill";

describe("markerLabel", () => {
  it("uses the same wording the options page labels each marker with", () => {
    expect(markerLabel("blocked")).toBe("Blocked (internal)");
    expect(markerLabel("blockedByOtherTeam")).toBe("Blocked by another team");
    expect(markerLabel("interrupt")).toBe("Interrupt");
  });
});

describe("renderMarkerPill", () => {
  it("distinguishes raised and accepted Interrupts without changing pill geometry", () => {
    const raised = renderMarkerPill(document, { marker: "interrupt" });
    const accepted = renderMarkerPill(document, { marker: "interrupt", accepted: true });

    expect(raised.dataset.accepted).toBe("false");
    expect(raised.style.background).toBe(
      "color-mix(in srgb, var(--marker-interrupt-background) 24%, transparent)",
    );
    expect(raised.style.color).toBe("var(--marker-interrupt-foreground)");
    expect(raised.style.border).toBe("1px solid var(--marker-interrupt-background)");
    expect(accepted.dataset.accepted).toBe("true");
    expect(accepted.style.background).toBe("var(--marker-interrupt-background)");
    expect(accepted.style.border).toBe("1px solid transparent");
    expect(raised.style.padding).toBe(accepted.style.padding);
  });

  it("keeps the raised edge inside an interactive filter's selection ring", () => {
    const raised = renderMarkerPill(document, { marker: "interrupt", interactive: true });
    const accepted = renderMarkerPill(document, {
      marker: "interrupt",
      interactive: true,
      accepted: true,
    });

    expect(raised.style.boxShadow).toBe("inset 0 0 0 1px var(--marker-interrupt-background)");
    expect(raised.style.border).toContain("transparent");
    expect(accepted.style.boxShadow).toBe("");
  });
  it("renders a static label with the marker's own wording and color", () => {
    const pill = renderMarkerPill(document, { marker: "blocked" });

    expect(pill.tagName).toBe("SPAN");
    expect(pill.textContent).toBe("Blocked (internal)");
    expect(pill.dataset.marker).toBe("blocked");
    expect(pill.style.background).toBe("var(--marker-blocked-background)");
  });

  it("paints the other-team marker with its semantic roles", () => {
    const pill = renderMarkerPill(document, { marker: "blockedByOtherTeam" });

    expect(pill.style.background).toBe("var(--marker-other-background)");
    expect(pill.style.color).toBe("var(--marker-other-foreground)");
  });

  it("shows the configured Azure DevOps tag as the tooltip", () => {
    const pill = renderMarkerPill(document, { marker: "blocked", title: 'ADO tag "Impediment"' });

    expect(pill.title).toBe('ADO tag "Impediment"');
  });

  it("becomes a pressed toggle button when interactive and selected", () => {
    const onToggle = vi.fn();
    const pill = renderMarkerPill(document, {
      marker: "interrupt",
      interactive: true,
      selected: true,
      onToggle,
    });

    expect(pill.tagName).toBe("BUTTON");
    expect((pill as HTMLButtonElement).type).toBe("button");
    expect(pill.getAttribute("aria-pressed")).toBe("true");
    expect(pill.classList.contains("awesomeado-marker-pill--selected")).toBe(true);
    expect(pill.style.opacity).toBe("1");

    pill.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("keeps an unselected toggle at full opacity without changing its size", () => {
    const pill = renderMarkerPill(document, { marker: "blocked", interactive: true });

    expect(pill.getAttribute("aria-pressed")).toBe("false");
    expect(pill.style.opacity).toBe("1");
    expect(pill.style.border).toContain("transparent");
  });
});
