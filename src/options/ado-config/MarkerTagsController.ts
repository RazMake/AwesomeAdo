import {
  WORK_ITEM_MARKERS,
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

/**
 * Drives the "Marker tags" section on the Azure DevOps tab: for each recognized condition (blocked,
 * blocked by another team, interrupt, waiting) it binds the team's Azure DevOps *tag* and the
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

  private readonly handleChange = (): void => {
    this.persist();
  };

  private persist(): void {
    const previous = this.confirmed;
    const markerTags = this.collect();
    this.confirmed = markerTags;
    void this.store.write({ markerTags }).catch((error: unknown) => {
      // The store rejected the write, so restore the last accepted values rather than leave the
      // fields showing something that was never persisted.
      this.confirmed = previous;
      if (previous !== null) {
        this.render(previous);
      }
      this.reportError(error);
    });
  }

  private collect(): WorkItemMarkerTags {
    const result = {} as WorkItemMarkerTags;
    for (const { key } of WORK_ITEM_MARKERS) {
      const row = this.elements.list.querySelector<HTMLElement>(
        `${ROW_SELECTOR}[${MARKER_ATTRIBUTE}="${key}"]`,
      );
      result[key] = {
        tag: this.readValue(row, TAG_ROLE),
        commentTag: this.readValue(row, COMMENT_ROLE),
      };
    }
    return result;
  }

  private readValue(row: HTMLElement | null, role: string): string {
    return (
      row?.querySelector<HTMLInputElement>(`[${ROLE_ATTRIBUTE}="${role}"]`)?.value.trim() ?? ""
    );
  }
}
