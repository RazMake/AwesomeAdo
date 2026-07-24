import type { ILogStore } from "../../common/logging/ILogStore";
import {
  formatLogEntry,
  formatTimestamp,
  type LogEntry,
  orderByTimestamp,
} from "../../common/logging/LogEntry";

import { MultiSelectFilter } from "./MultiSelectFilter";

/** The Diagnostics tab's log-view elements. Passed in so the controller stays DOM-agnostic and
 *  testable. */
export interface DiagnosticsElements {
  /** Container the controller fills with one row per log entry. */
  list: HTMLElement;
  /** Notice shown when there is nothing to display (after any active filter). */
  empty: HTMLElement;
  /** Checkbox that, when checked, hides non-error lines. */
  errorsOnlyToggle: HTMLInputElement;
  /** Root the controller mounts the searchable per-source multi-select dropdown into. */
  sourceFilter: HTMLElement;
  /** Button that downloads the currently shown lines as a text file. */
  exportButton: HTMLButtonElement;
  /** Button that empties the log. */
  clearButton: HTMLButtonElement;
}

// Entries recorded without a source (or by any code that omits it) are bucketed under one stable key
// so they remain filterable rather than silently un-toggleable.
const UNLABELED_SOURCE_KEY = "(unlabeled)";

/** The filter/display bucket for an entry: its source, or the unlabeled bucket when it has none. */
function sourceKey(entry: LogEntry): string {
  return entry.source !== undefined && entry.source.length > 0
    ? entry.source
    : UNLABELED_SOURCE_KEY;
}

/**
 * Drives the Diagnostics log view: renders the local log ordered by timestamp, offers a quick
 * "errors only" filter and a searchable per-source multi-select filter, exports the shown lines to a
 * text file, and clears the log.
 *
 * Depends only on ILogStore (Dependency Inversion) so it reads/observes/clears the log without ever
 * touching chrome.* and is fully testable with a fake store. It never logs — rendering must not feed
 * the same store it observes, which would loop.
 */
export class DiagnosticsController {
  private entries: LogEntry[] = [];
  private unsubscribe: (() => void) | undefined;
  private disposed = false;
  // The searchable multi-select that owns which sources are hidden. Keyed by source (with the
  // unlabeled bucket) so a hidden choice survives re-renders and even survives a source disappearing
  // then reappearing as new lines arrive.
  private readonly sourceFilter: MultiSelectFilter;

  constructor(
    private readonly store: ILogStore,
    private readonly elements: DiagnosticsElements,
  ) {
    this.sourceFilter = new MultiSelectFilter(elements.sourceFilter, {
      allLabel: "All sources",
      itemNoun: "sources",
      searchPlaceholder: "Filter sources…",
      noMatchesText: "No matching sources.",
      onChange: () => this.render(),
    });
  }

  async init(): Promise<void> {
    this.elements.errorsOnlyToggle.addEventListener("change", this.handleFilterChange);
    this.elements.exportButton.addEventListener("click", this.handleExport);
    this.elements.clearButton.addEventListener("click", this.handleClear);
    const observation = this.store.observe(this.handleEntries);
    this.unsubscribe = observation.unsubscribe;
    try {
      await observation.ready;
    } catch (error: unknown) {
      this.dispose();
      throw error;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.elements.errorsOnlyToggle.removeEventListener("change", this.handleFilterChange);
    this.elements.exportButton.removeEventListener("click", this.handleExport);
    this.elements.clearButton.removeEventListener("click", this.handleClear);
    this.sourceFilter.dispose();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private readonly handleEntries = (entries: LogEntry[]): void => {
    if (this.disposed) {
      return;
    }
    this.entries = entries;
    this.render();
  };

  private readonly handleFilterChange = (): void => {
    this.render();
  };

  private readonly handleClear = (): void => {
    void this.store.clear().catch(() => undefined);
  };

  private readonly handleExport = (): void => {
    this.exportShownEntries();
  };

  /** The entries currently shown: ordered oldest → newest, narrowed to errors when filtered, and with
   *  any sources the user unchecked removed. */
  private shownEntries(): LogEntry[] {
    const ordered = orderByTimestamp(this.entries);
    const errorsOnly = this.elements.errorsOnlyToggle.checked;
    return ordered.filter(
      (entry) =>
        (!errorsOnly || entry.level === "error") && !this.sourceFilter.isHidden(sourceKey(entry)),
    );
  }

  private render(): void {
    this.sourceFilter.setItems(this.distinctSourceKeys());
    const shown = this.shownEntries();
    const doc = this.elements.list.ownerDocument;
    this.elements.list.replaceChildren(...shown.map((entry) => this.renderRow(doc, entry)));
    this.elements.empty.hidden = shown.length > 0;
    this.elements.exportButton.disabled = shown.length === 0;
  }

  /** The distinct source buckets present in the current log, sorted for a stable filter order. */
  private distinctSourceKeys(): string[] {
    const keys = new Set<string>();
    for (const entry of this.entries) {
      keys.add(sourceKey(entry));
    }
    return [...keys].sort();
  }

  private renderRow(doc: Document, entry: LogEntry): HTMLElement {
    const row = doc.createElement("div");
    row.className = `log-row log-row--${entry.level}`;

    const time = doc.createElement("span");
    time.className = "log-row__time";
    time.textContent = formatTimestamp(entry.timestamp);

    const level = doc.createElement("span");
    level.className = "log-row__level";
    level.textContent = entry.level === "error" ? "ERROR" : "INFO";

    const source = doc.createElement("span");
    source.className = "log-row__source";
    source.textContent = sourceKey(entry);

    const message = doc.createElement("span");
    message.className = "log-row__message";
    message.textContent = entry.message;

    row.append(time, level, source, message);
    if (entry.detail !== undefined) {
      const detail = doc.createElement("pre");
      detail.className = "log-row__detail";
      detail.textContent = entry.detail;
      row.append(detail);
    }
    return row;
  }

  private exportShownEntries(): void {
    const shown = this.shownEntries();
    if (shown.length === 0) {
      return;
    }
    const text = shown.map(formatLogEntry).join("\n");
    const doc = this.elements.list.ownerDocument;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = doc.createElement("a");
      anchor.href = url;
      // Colons are illegal in filenames on Windows, so use a filesystem-safe stamp.
      anchor.download = `awesomeado-log-${formatTimestamp(Date.now()).replace(/[:.]/g, "-")}.txt`;
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
