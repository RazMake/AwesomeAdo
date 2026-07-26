import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { StorageObservation } from "../../common/browser/observeStorageKeys";
import {
  DEFAULT_MARKER_TAGS,
  WORK_ITEM_MARKERS,
  type ExtensionSettings,
  type WorkItemMarker,
  type WorkItemMarkerTags,
} from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";

import { MarkerTagsController, type MarkerTagsElements } from "./MarkerTagsController";

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

class FakeSettingsStore implements ISettingsStore {
  writeCalls: Partial<ExtensionSettings>[] = [];
  private writeError: unknown = null;

  setWriteError(error: unknown): void {
    this.writeError = error;
  }

  observe(): StorageObservation {
    return { ready: Promise.resolve(), unsubscribe: () => {} };
  }

  read(): Promise<ExtensionSettings> {
    throw new Error("MarkerTagsController never reads directly; the parent feeds it via render().");
  }

  write(update: Partial<ExtensionSettings>): Promise<void> {
    this.writeCalls.push(structuredClone(update));
    if (this.writeError !== null) {
      return Promise.reject(this.writeError);
    }
    return Promise.resolve();
  }
}

function makeElements(): MarkerTagsElements {
  const list = document.createElement("div");
  document.body.append(list);
  return { list };
}

function rowFor(elements: MarkerTagsElements, marker: WorkItemMarker): HTMLElement {
  const row = elements.list.querySelector<HTMLElement>(`[data-marker="${marker}"]`);
  if (row === null) {
    throw new Error(`Missing marker row for ${marker}`);
  }
  return row;
}

function inputFor(
  elements: MarkerTagsElements,
  marker: WorkItemMarker,
  role: "tag" | "comment",
): HTMLInputElement {
  const input = rowFor(elements, marker).querySelector<HTMLInputElement>(`[data-role="${role}"]`);
  if (input === null) {
    throw new Error(`Missing ${role} input for ${marker}`);
  }
  return input;
}

function setValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("MarkerTagsController", () => {
  let store: FakeSettingsStore;
  let elements: MarkerTagsElements;
  let errors: unknown[];
  let controller: MarkerTagsController;

  beforeEach(() => {
    store = new FakeSettingsStore();
    elements = makeElements();
    errors = [];
    controller = new MarkerTagsController(store, elements, (error) => errors.push(error));
    controller.init();
  });

  afterEach(() => {
    controller.dispose();
    document.body.replaceChildren();
  });

  it("renders one row per marker, seeded with the provided values", () => {
    controller.render(DEFAULT_MARKER_TAGS);

    expect(elements.list.querySelectorAll(".marker-tags-row")).toHaveLength(
      WORK_ITEM_MARKERS.length,
    );
    expect(inputFor(elements, "blocked", "tag").value).toBe("Blocked");
    expect(inputFor(elements, "blocked", "comment").value).toBe("[BLOCKED]");
    expect(inputFor(elements, "blockedByOtherTeam", "comment").value).toBe("[ACCEPTED]");
    expect(inputFor(elements, "interrupt", "comment").value).toBe("");
    expect(inputFor(elements, "waiting", "comment").value).toBe("[WAITING]");
  });

  it("persists all markers on a change, trimming the edited value", async () => {
    controller.render(DEFAULT_MARKER_TAGS);

    setValue(inputFor(elements, "blocked", "tag"), "  Impediment  ");
    await flush();

    expect(store.writeCalls).toHaveLength(1);
    const written = store.writeCalls[0]?.markerTags as WorkItemMarkerTags;
    expect(written.blocked).toEqual({ tag: "Impediment", commentTag: "[BLOCKED]" });
    // The other markers are written through unchanged, so the slice always holds every marker.
    expect(written.waiting).toEqual({ tag: "Waiting", commentTag: "[WAITING]" });
    expect(errors).toHaveLength(0);
  });

  it("keeps a deliberately blanked marker blank in the persisted value", async () => {
    controller.render(DEFAULT_MARKER_TAGS);

    setValue(inputFor(elements, "interrupt", "tag"), "");
    await flush();

    const written = store.writeCalls.at(-1)?.markerTags as WorkItemMarkerTags;
    expect(written.interrupt).toEqual({ tag: "", commentTag: "" });
  });

  it("restores the last accepted values and reports the error when a write fails", async () => {
    controller.render(DEFAULT_MARKER_TAGS);
    store.setWriteError(new Error("sync offline"));

    setValue(inputFor(elements, "waiting", "tag"), "Parked");
    await flush();

    expect(errors).toHaveLength(1);
    // The rejected value must not linger in the field; the row is re-rendered from the last snapshot.
    expect(inputFor(elements, "waiting", "tag").value).toBe("Waiting");
  });

  it("ignores changes after dispose so a late event cannot persist", async () => {
    controller.render(DEFAULT_MARKER_TAGS);
    const tagInput = inputFor(elements, "blocked", "tag");
    controller.dispose();

    setValue(tagInput, "Late");
    await flush();

    expect(store.writeCalls).toHaveLength(0);
  });
});
