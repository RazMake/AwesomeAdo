import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MARKER_TAGS,
  type WorkItemMarker,
} from "../../../../common/settings/ExtensionSettings";

import { renderMarkerFilterPills } from "./MarkerFilterPanel";

/** Renders the pills over a caller-owned selection, and reports both back. */
function renderPills(markers: WorkItemMarker[], selected: WorkItemMarker[] = []) {
  const selection = new Set<WorkItemMarker>(selected);
  const onChange = vi.fn();
  const pills = renderMarkerFilterPills(document, {
    markers,
    markerTags: DEFAULT_MARKER_TAGS,
    selected: selection,
    onChange,
  });
  return { pills, selection, onChange };
}

describe("renderMarkerFilterPills", () => {
  it("renders one toggle per offered marker, in the order it was given them", () => {
    const { pills } = renderPills(["blockedByOtherTeam", "blocked"]);

    expect(pills.map((pill) => pill.textContent)).toEqual([
      "Blocked by another team",
      "Blocked (internal)",
    ]);
    expect(pills.every((pill) => pill.tagName === "BUTTON")).toBe(true);
  });

  it("names the literal Azure DevOps tag each pill stands for", () => {
    const { pills } = renderPills(["blocked"]);

    expect(pills[0]!.title).toBe('Azure DevOps tag "Blocked"');
  });

  it("reflects the caller's selection rather than keeping its own", () => {
    const { pills } = renderPills(["blocked", "blockedByOtherTeam"], ["blocked"]);

    expect(pills[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(pills[1]!.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps selected and unselected markers at full opacity", () => {
    const { pills } = renderPills(["blocked", "blockedByOtherTeam"], ["blocked"]);

    expect(pills[0]?.style.opacity).toBe("1");
    expect(pills[1]?.style.opacity).toBe("1");
  });

  it("always uses the accepted paint for an Interrupt filter", () => {
    const interrupt = renderPills(["interrupt"]).pills[0]!;

    expect(interrupt.dataset.accepted).toBe("true");
    expect(interrupt.style.background).toBe("var(--marker-interrupt-background)");
  });

  it("adds a marker to the selection on click and reports the change", () => {
    const { pills, selection, onChange } = renderPills(["blocked"]);

    pills[0]!.click();

    expect([...selection]).toEqual(["blocked"]);
    expect(onChange).toHaveBeenCalledWith(selection);
  });

  it("removes an already-selected marker on click", () => {
    const { pills, selection, onChange } = renderPills(["blocked"], ["blocked"]);

    pills[0]!.click();

    expect([...selection]).toEqual([]);
    expect(onChange).toHaveBeenCalledWith(selection);
  });

  it("renders nothing when no marker is in use", () => {
    const { pills } = renderPills([]);

    expect(pills).toEqual([]);
  });
});
