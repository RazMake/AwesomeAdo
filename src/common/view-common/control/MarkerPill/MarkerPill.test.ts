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

/** Every declaration but the pointer, which is the only thing an opener is allowed to add. */
function paintOf(pill: HTMLElement): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (let index = 0; index < pill.style.length; index += 1) {
    const property = pill.style.item(index);
    if (property !== "cursor") declarations[property] = pill.style.getPropertyValue(property);
  }
  return declarations;
}

/** What a pill is allowed to vary between variants: its colours. Everything else is its shape. */
const PAINT_PROPERTY = /color|background|border/;

function shapeOf(pill: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    Object.entries(paintOf(pill)).filter(([property]) => !PAINT_PROPERTY.test(property)),
  );
}

/** The border carries a colour, so only the width and style it contributes count as shape. */
function borderShapeOf(pill: HTMLElement): string {
  const [width, style] = pill.style.border.split(" ");
  return `${width} ${style}`;
}

const VARIANTS = [
  ["a raised Interrupt", { marker: "interrupt" } as const],
  ["an accepted Interrupt", { marker: "interrupt", accepted: true } as const],
  ["Blocked (internal)", { marker: "blocked" } as const],
  ["Blocked by another team", { marker: "blockedByOtherTeam" } as const],
] as const;

describe("a marker pill that opens its reasons", () => {
  it.each(VARIANTS)(
    "paints %s exactly as the static pill of the same variant",
    (_name, variant) => {
      const opener = renderMarkerPill(document, { ...variant, onActivate: vi.fn() });

      expect(opener.tagName).toBe("BUTTON");
      expect(paintOf(opener)).toEqual(paintOf(renderMarkerPill(document, variant)));
      expect(opener.style.cursor).toBe("pointer");
    },
  );

  it("states the button defaults that would otherwise redraw it", () => {
    const pill = renderMarkerPill(document, { marker: "interrupt", onActivate: vi.fn() });

    expect(pill.style.border).toBe("1px solid var(--marker-interrupt-background)");
    expect(pill.style.lineHeight).toBe("1.6");
    expect(pill.style.fontFamily).toBe("inherit");
    expect(pill.style.margin).toBe("0px");
    expect(pill.style.boxSizing).toBe("border-box");
  });

  it("opens without letting the row beneath it react", () => {
    const onActivate = vi.fn();
    const onRow = vi.fn();
    const row = document.createElement("div");
    row.addEventListener("click", onRow);
    row.append(renderMarkerPill(document, { marker: "interrupt", onActivate }));

    row.querySelector("button")?.click();

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onRow).not.toHaveBeenCalled();
  });
});

/**
 * The invariant behind the whole control: variants differ by COLOUR and by nothing else, so a pill
 * can never take up more room on one surface than the same pill does on another. A change that
 * legitimately alters the pill's shape has to alter it here for every variant at once.
 */
describe("marker pill shape", () => {
  it.each(VARIANTS)("gives %s the same shape as every other variant", (_name, variant) => {
    const pill = renderMarkerPill(document, variant);
    const reference = renderMarkerPill(document, { marker: "blocked" });

    expect(shapeOf(pill)).toEqual(shapeOf(reference));
    expect(borderShapeOf(pill)).toBe(borderShapeOf(reference));
  });

  it("keeps a raised Interrupt visibly apart from an accepted one", () => {
    const raised = renderMarkerPill(document, { marker: "interrupt" });
    const accepted = renderMarkerPill(document, { marker: "interrupt", accepted: true });

    expect(raised.style.background).not.toBe(accepted.style.background);
    expect(raised.style.border).not.toBe(accepted.style.border);
  });
});
