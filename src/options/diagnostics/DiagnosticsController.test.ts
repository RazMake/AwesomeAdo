import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StorageObservation } from "../../common/browser/observeSyncKeys";
import type { ILogStore } from "../../common/logging/ILogStore";
import { formatLogEntry, type LogEntry } from "../../common/logging/LogEntry";

import { DiagnosticsController, type DiagnosticsElements } from "./DiagnosticsController";

class FakeLogStore implements ILogStore {
  listener: ((entries: LogEntry[]) => void) | null = null;
  readonly unsubscribe = vi.fn();
  readonly clear = vi.fn(() => Promise.resolve());
  ready: Promise<void> = Promise.resolve();

  read(): Promise<LogEntry[]> {
    return Promise.resolve([]);
  }

  observe(listener: (entries: LogEntry[]) => void): StorageObservation {
    this.listener = listener;
    return { ready: this.ready, unsubscribe: this.unsubscribe };
  }

  emit(entries: LogEntry[]): void {
    this.listener?.(entries);
  }
}

function makeElements(): DiagnosticsElements {
  document.body.innerHTML = `
    <div id="list"></div>
    <p id="empty"></p>
    <input id="toggle" type="checkbox" />
    <div id="sources"></div>
    <button id="export"></button>
    <button id="clear"></button>
  `;
  return {
    list: document.getElementById("list") as HTMLElement,
    empty: document.getElementById("empty") as HTMLElement,
    errorsOnlyToggle: document.getElementById("toggle") as HTMLInputElement,
    sourceFilter: document.getElementById("sources") as HTMLElement,
    exportButton: document.getElementById("export") as HTMLButtonElement,
    clearButton: document.getElementById("clear") as HTMLButtonElement,
  };
}

const info = (timestamp: number, message: string, source?: string): LogEntry =>
  source === undefined
    ? { timestamp, level: "info", message }
    : { timestamp, level: "info", message, source };
const error = (timestamp: number, message: string, detail?: string): LogEntry =>
  detail === undefined
    ? { timestamp, level: "error", message }
    : { timestamp, level: "error", message, detail };

function messagesShown(elements: DiagnosticsElements): string[] {
  return [...elements.list.querySelectorAll(".log-row__message")].map(
    (node) => node.textContent ?? "",
  );
}

/** The source labels the filter dropdown offers, in render order. */
function sourceOptions(elements: DiagnosticsElements): string[] {
  return [...elements.sourceFilter.querySelectorAll(".multiselect__option-label")].map(
    (node) => node.textContent ?? "",
  );
}

/** Toggle the filter checkbox for one source, simulating a user click. */
function toggleSource(elements: DiagnosticsElements, source: string, checked: boolean): void {
  const label = [...elements.sourceFilter.querySelectorAll(".multiselect__option")].find(
    (node) => node.querySelector(".multiselect__option-label")?.textContent === source,
  );
  const checkbox = label?.querySelector("input") as HTMLInputElement;
  checkbox.checked = checked;
  checkbox.dispatchEvent(new Event("change"));
}

describe("DiagnosticsController", () => {
  let store: FakeLogStore;
  let elements: DiagnosticsElements;
  let controller: DiagnosticsController;

  beforeEach(() => {
    store = new FakeLogStore();
    elements = makeElements();
    controller = new DiagnosticsController(store, elements);
  });

  it("renders entries oldest → newest regardless of arrival order", async () => {
    await controller.init();

    store.emit([info(30, "c"), info(10, "a"), info(20, "b")]);

    expect(messagesShown(elements)).toEqual(["a", "b", "c"]);
    expect(elements.empty.hidden).toBe(true);
    expect(elements.exportButton.disabled).toBe(false);
  });

  it("shows the empty notice and disables export when there is nothing to show", async () => {
    await controller.init();

    store.emit([]);

    expect(messagesShown(elements)).toEqual([]);
    expect(elements.empty.hidden).toBe(false);
    expect(elements.exportButton.disabled).toBe(true);
  });

  it("narrows to error lines when the errors-only filter is checked", async () => {
    await controller.init();
    store.emit([info(10, "info line"), error(20, "error line")]);

    elements.errorsOnlyToggle.checked = true;
    elements.errorsOnlyToggle.dispatchEvent(new Event("change"));

    expect(messagesShown(elements)).toEqual(["error line"]);
  });

  it("renders a detail block for error entries that carry one", async () => {
    await controller.init();

    store.emit([error(10, "boom", "Error: boom\n    at here")]);

    const detail = elements.list.querySelector(".log-row__detail");
    expect(detail?.textContent).toBe("Error: boom\n    at here");
  });

  it("clears the log when the clear button is clicked", async () => {
    await controller.init();

    elements.clearButton.click();

    expect(store.clear).toHaveBeenCalledOnce();
  });

  it("exports the shown lines as a timestamped text file", async () => {
    vi.spyOn(Date, "now").mockReturnValue(0);
    const created: Blob[] = [];
    let downloadName = "";
    const createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:mock";
    });
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
    });

    await controller.init();
    const entries = [info(10, "a"), error(20, "b")];
    store.emit(entries);
    elements.exportButton.click();

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(await created[0]?.text()).toBe(entries.map(formatLogEntry).join("\n"));
    expect(downloadName).toBe("awesomeado-log-1970-01-01T00-00-00-000Z.txt");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("does not export when nothing is shown", async () => {
    const createObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;

    await controller.init();
    store.emit([]);
    elements.exportButton.click();

    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects init and unsubscribes when the initial read fails", async () => {
    store.ready = Promise.reject(new Error("read failed"));

    await expect(controller.init()).rejects.toThrow("read failed");
    expect(store.unsubscribe).toHaveBeenCalledOnce();

    // A late emit after disposal must not render anything.
    store.emit([info(10, "late")]);
    expect(messagesShown(elements)).toEqual([]);
  });

  it("stops responding to filter changes and unsubscribes after dispose", async () => {
    await controller.init();
    store.emit([info(10, "info line"), error(20, "error line")]);

    controller.dispose();
    elements.errorsOnlyToggle.checked = true;
    elements.errorsOnlyToggle.dispatchEvent(new Event("change"));

    expect(messagesShown(elements)).toEqual(["info line", "error line"]);
    expect(store.unsubscribe).toHaveBeenCalledOnce();
  });

  describe("source filter", () => {
    it("offers one sorted option per distinct source", async () => {
      await controller.init();

      store.emit([
        info(10, "a", "QueryPageController"),
        info(20, "b", "background"),
        info(30, "c", "QueryPageController"),
      ]);

      expect(sourceOptions(elements)).toEqual(["QueryPageController", "background"].sort());
    });

    it("buckets an entry with no source under the unlabeled option", async () => {
      await controller.init();

      store.emit([info(10, "a", "content"), info(20, "legacy")]);

      expect(sourceOptions(elements)).toEqual(["(unlabeled)", "content"]);
    });

    it("hides the lines of an unchecked source and shows them again when re-checked", async () => {
      await controller.init();
      store.emit([info(10, "from content", "content"), info(20, "from background", "background")]);

      toggleSource(elements, "background", false);
      expect(messagesShown(elements)).toEqual(["from content"]);

      // Re-checking restores the hidden source's lines.
      toggleSource(elements, "background", true);
      expect(messagesShown(elements)).toEqual(["from content", "from background"]);
    });

    it("keeps a source hidden as new lines for it arrive", async () => {
      await controller.init();
      store.emit([info(10, "first", "background"), info(20, "keep", "content")]);

      toggleSource(elements, "background", false);
      expect(messagesShown(elements)).toEqual(["keep"]);

      // A later batch that reintroduces the hidden source must not resurface its lines: the user's
      // choice is keyed by source, so it survives re-renders.
      store.emit([
        info(10, "first", "background"),
        info(20, "keep", "content"),
        info(30, "second", "background"),
      ]);

      expect(messagesShown(elements)).toEqual(["keep"]);
    });

    it("combines the source filter with the errors-only filter", async () => {
      await controller.init();
      store.emit([
        info(10, "content info", "content"),
        { timestamp: 20, level: "error", message: "content error", source: "content" },
        {
          timestamp: 30,
          level: "error",
          message: "settings error",
          source: "BrowserSyncSettingsStore",
        },
      ]);

      elements.errorsOnlyToggle.checked = true;
      elements.errorsOnlyToggle.dispatchEvent(new Event("change"));
      toggleSource(elements, "BrowserSyncSettingsStore", false);

      // Errors-only removes the info line; the source filter removes the settings error; only the
      // content error survives both.
      expect(messagesShown(elements)).toEqual(["content error"]);
    });

    it("renders each row's source next to its level", async () => {
      await controller.init();

      store.emit([info(10, "a", "BrowserSyncQueryBindingStore")]);

      const sourceCell = elements.list.querySelector(".log-row__source");
      expect(sourceCell?.textContent).toBe("BrowserSyncQueryBindingStore");
    });
  });
});
