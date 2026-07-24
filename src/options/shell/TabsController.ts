/**
 * Wires an ARIA tablist so clicking a tab shows its panel and hides the rest.
 *
 * Kept separate from the settings controller (Single Responsibility): tab navigation is pure DOM
 * behaviour with no knowledge of settings, storage, or Azure DevOps.
 */
export class TabsController {
  private readonly tabs: HTMLElement[];
  private readonly panels: HTMLElement[];

  constructor(root: ParentNode) {
    this.tabs = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
    this.panels = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
  }

  init(): void {
    for (const tab of this.tabs) {
      tab.addEventListener("click", this.handleClick);
    }
  }

  dispose(): void {
    for (const tab of this.tabs) {
      tab.removeEventListener("click", this.handleClick);
    }
  }

  /** Programmatically show a tab by its element id (e.g. deep-linking into binding mode). No-op if unknown. */
  activate(tabId: string): void {
    const tab = this.tabs.find((candidate) => candidate.id === tabId);
    if (tab) {
      this.select(tab);
    }
  }

  private readonly handleClick = (event: Event): void => {
    this.select(event.currentTarget as HTMLElement);
  };

  private select(selectedTab: HTMLElement): void {
    for (const tab of this.tabs) {
      tab.setAttribute("aria-selected", String(tab === selectedTab));
    }
    for (const panel of this.panels) {
      const owningTab = this.tabs.find((tab) => tab.getAttribute("aria-controls") === panel.id);
      panel.hidden = owningTab?.getAttribute("aria-selected") !== "true";
    }
  }
}
