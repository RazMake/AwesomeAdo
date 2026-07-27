import {
  WORK_ITEM_MARKERS,
  type MarkerTags,
  type WorkItemMarker,
  type WorkItemMarkerTags,
} from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";

import { ROLE_ATTRIBUTE, createRoleInput } from "./roleInput";

/** The marker-tags section's elements, injected so the controller stays DOM-agnostic and testable. */
export interface MarkerTagsElements {
  /** Container the controller fills with one row (label + tag + comment tag) per marker. */
  list: HTMLElement;
}

type ReportError = (error: unknown) => void;

const MARKER_ATTRIBUTE = "data-marker";
const TAG_ROLE = "tag";
const COMMENT_ROLE = "comment";
const ROW_SELECTOR = ".marker-tags-row";

/** Which field of a marker's entry each input role edits; any other role is not a marker field. */
const FIELD_BY_ROLE: Readonly<Record<string, keyof MarkerTags>> = {
  [TAG_ROLE]: "tag",
  [COMMENT_ROLE]: "commentTag",
};

const MARKER_KEYS = new Set<string>(WORK_ITEM_MARKERS.map(({ key }) => key));

/**
 * Drives the "Marker tags" section on the Azure DevOps tab: for each recognized condition (blocked,
 * blocked by another team, interrupt) it binds the team's Azure DevOps *tag* and the
 * *comment* token to the synced settings store.
 *
 * It owns only this section's DOM and its persistence; the parent `AzureDevOpsController` performs
 * the single settings load and feeds the values in (`render`), matching how the work-item-types
 * sub-controller is wired. The store is injected (Dependency Inversion), so this controller is fully
 * testable without a browser. The marker set and its presentation order come from the single
 * `WORK_ITEM_MARKERS` source of truth, so adding a marker never touches this controller.
 */
export class MarkerTagsController {
  private disposed = false;
  // The last values successfully applied, so a failed write can restore the fields to a known-good
  // state instead of leaving a value the store never accepted.
  private confirmed: WorkItemMarkerTags | null = null;

  constructor(
    private readonly store: ISettingsStore,
    private readonly elements: MarkerTagsElements,
    private readonly reportError: ReportError,
  ) {}

  init(): void {
    // Delegated on the container so the fixed rows need no per-input listener bookkeeping.
    this.elements.list.addEventListener("change", this.handleChange);
  }

  dispose(): void {
    this.disposed = true;
    this.elements.list.removeEventListener("change", this.handleChange);
  }

  render(markerTags: WorkItemMarkerTags): void {
    if (this.disposed) {
      return;
    }
    this.confirmed = markerTags;
    const doc = this.elements.list.ownerDocument;
    this.elements.list.replaceChildren();
    for (const { key, label } of WORK_ITEM_MARKERS) {
      this.elements.list.append(this.createRow(doc, key, label, markerTags[key]));
    }
  }

  private createRow(
    doc: Document,
    marker: WorkItemMarker,
    label: string,
    value: { tag: string; commentTag: string },
  ): HTMLElement {
    const row = doc.createElement("div");
    row.className = "marker-tags-row";
    row.setAttribute(MARKER_ATTRIBUTE, marker);
    const name = doc.createElement("span");
    name.className = "marker-tags-row__label";
    name.textContent = label;
    row.append(
      name,
      createRoleInput(doc, TAG_ROLE, `${label} tag`, value.tag, "ADO tag"),
      createRoleInput(doc, COMMENT_ROLE, `${label} comment tag`, value.commentTag, "Comment tag"),
    );
    return row;
  }

  /**
   * Persist the single field the user edited.
   *
   * The edited control names its own marker (its row) and its own field (its role), so an edit can
   * only ever be stored under the row it was typed into. Re-reading the whole section instead would
   * make every save only as trustworthy as the entire form's current DOM: one perturbed input — a
   * value the browser restored into the wrong control on session restore, a row left over from an
   * import that did not re-render — would be written under a neighbouring marker and silently
   * overwrite it. Every other marker is carried over from the last accepted state, never re-scraped.
   */
  private readonly handleChange = (event: Event): void => {
    const input = event.target as HTMLElement;
    const field = FIELD_BY_ROLE[input.getAttribute(ROLE_ATTRIBUTE) ?? ""];
    const marker = input.closest<HTMLElement>(ROW_SELECTOR)?.getAttribute(MARKER_ATTRIBUTE) ?? "";
    // Anything that is not one of this section's own inputs — or an edit that somehow arrives before
    // the rows are seeded — has no marker to attribute the value to, so it is not persistable.
    if (field === undefined || !MARKER_KEYS.has(marker) || this.confirmed === null) {
      return;
    }
    this.persist(marker as WorkItemMarker, field, (input as HTMLInputElement).value.trim());
  };

  private persist(marker: WorkItemMarker, field: keyof MarkerTags, value: string): void {
    const previous = this.confirmed;
    if (previous === null) {
      return;
    }
    const markerTags: WorkItemMarkerTags = {
      ...previous,
      [marker]: { ...previous[marker], [field]: value },
    };
    this.confirmed = markerTags;
    void this.store.write({ markerTags }).catch((error: unknown) => {
      // The store rejected the write, so restore the last accepted values rather than leave the
      // fields showing something that was never persisted.
      this.confirmed = previous;
      this.render(previous);
      this.reportError(error);
    });
  }
}
