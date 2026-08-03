import type { IQueryBindingStore } from "../../common/bindings/IQueryBindingStore";
import type { QueryBindings } from "../../common/bindings/QueryBinding";
import type { StorageObservation } from "../../common/browser/observeStorageKeys";
import { buildSharedQueryLink } from "../../common/navigation/SharedQueryLink";
import type { ExtensionSettings } from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";
import type { ObservableTeamConfigSource } from "../../common/settings-transfer/TeamConfigSourceStore";

import { renderTransferStatus } from "./transferStatus";

/** The Quick Bootstrap link block's elements. Passed in so the controller stays testable. */
export interface BootstrapLinkElements {
  /** The whole block, including its label — hidden until there is a link worth handing out. */
  section: HTMLElement;
  link: HTMLAnchorElement;
  copyButton: HTMLButtonElement;
  /** Confirms the copy, or says why the clipboard write never landed. */
  status: HTMLElement;
}

type ReportError = (error: unknown) => void;

/**
 * Offers one link that bootstraps a teammate: an enhanced query's Azure DevOps URL carrying the
 * connected configuration work item, so opening it both shows them the query and points their
 * extension at the team's shared configuration with nothing to import.
 *
 * The block is hidden unless a link would actually work — a configuration work item is connected,
 * at least one query is enhanced, and the organization and project are known — because a link that
 * names a blank is worse than no link: it looks shareable and lands the recipient nowhere. All three
 * inputs are observed rather than read once, so connecting, disconnecting, or enhancing a query
 * reveals or withdraws the link immediately instead of at the next page load.
 */
export class BootstrapLinkController {
  private disposed = false;
  private observations: StorageObservation[] = [];
  private settings: ExtensionSettings | null = null;
  private bindings: QueryBindings | null = null;
  private workItemId: number | null = null;
  /** The link currently on offer, so Copy shares exactly what the anchor shows. */
  private url: string | null = null;

  constructor(
    private readonly settingsStore: ISettingsStore,
    private readonly bindingStore: IQueryBindingStore,
    private readonly teamConfigSource: ObservableTeamConfigSource,
    private readonly elements: BootstrapLinkElements,
    private readonly reportError: ReportError,
  ) {}

  init(): void {
    this.elements.copyButton.addEventListener("click", this.handleCopy);
    this.render();
    this.observations = [
      this.settingsStore.observe((settings) => {
        this.settings = settings;
        this.render();
      }),
      this.bindingStore.observe((bindings) => {
        this.bindings = bindings;
        this.render();
      }),
      this.teamConfigSource.observe((workItemId) => {
        this.workItemId = workItemId;
        this.render();
      }),
    ];
    for (const observation of this.observations) {
      observation.ready.catch(this.reportError);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.elements.copyButton.removeEventListener("click", this.handleCopy);
    for (const observation of this.observations) {
      observation.unsubscribe();
    }
    this.observations = [];
  }

  private render(): void {
    if (this.disposed) {
      return;
    }
    this.url = this.buildLink();
    this.elements.section.hidden = this.url === null;
    if (this.url === null) {
      // Drop the stale href as well as the text: a hidden anchor is still reachable by keyboard in
      // some assistive tooling, and it must never point at a connection the user just dropped.
      this.elements.link.removeAttribute("href");
      this.elements.link.textContent = "";
      return;
    }
    this.elements.link.href = this.url;
    this.elements.link.textContent = this.url;
    this.elements.link.target = "_blank";
    this.elements.link.rel = "noopener noreferrer";
  }

  /** The link to offer, or null while any part of it is still missing. */
  private buildLink(): string | null {
    if (this.settings === null || this.bindings === null || this.workItemId === null) {
      return null;
    }
    const queryId = pickQuery(this.bindings);
    if (queryId === null) {
      return null;
    }
    return buildSharedQueryLink({
      organization: this.settings.organization,
      project: this.settings.project,
      queryId,
      workItemId: this.workItemId,
    });
  }

  private readonly handleCopy = (): void => {
    void this.copy();
  };

  private async copy(): Promise<void> {
    const url = this.url;
    try {
      const clipboard = this.elements.copyButton.ownerDocument.defaultView?.navigator.clipboard;
      if (url === null || !clipboard) {
        throw new Error("There is no link to copy, or this page cannot reach the clipboard.");
      }
      await clipboard.writeText(url);
      this.setStatus("Copied the bootstrap link. Paste it into Teams or an email.", false);
    } catch (error: unknown) {
      // A refused clipboard write fails invisibly, so record it: Diagnostics is what answers "why is
      // my clipboard still empty?" once the user has moved on to pasting.
      this.reportError(error);
      const detail = error instanceof Error ? error.message : String(error);
      this.setStatus(`Could not copy the bootstrap link: ${detail}`, true);
    }
  }

  private setStatus(message: string, failed: boolean): void {
    if (this.disposed) {
      return;
    }
    renderTransferStatus(this.elements.status, message, failed);
  }
}

/**
 * Choose which enhanced query the link opens on. Sorted by the name the user recognizes (falling
 * back to the id for a binding saved before its name was captured) so the same configuration always
 * produces the same link, rather than one that shifts with storage's key order.
 */
function pickQuery(bindings: QueryBindings): string | null {
  const label = (queryId: string): string => bindings[queryId]?.name ?? queryId;
  let chosen: string | null = null;
  for (const queryId of Object.keys(bindings)) {
    const isEarlier =
      chosen === null ||
      label(queryId).localeCompare(label(chosen), undefined, { sensitivity: "base" }) < 0;
    if (isEarlier) {
      chosen = queryId;
    }
  }
  return chosen;
}
