import type { ExtensionSettings } from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";
import { normalizeAreaPaths, type SprintAreaPaths } from "../../common/settings/SprintAreaPaths";

export interface DefaultAreaPathsElements {
  input: HTMLInputElement;
  addButton: HTMLButtonElement;
  list: HTMLElement;
}

type ReportError = (error: unknown) => void;

/** Edits the area paths initially selected whenever Sprint View opens a sprint. */
export class DefaultAreaPathsController {
  private defaults: string[] = [];
  private sprintAreaPaths: SprintAreaPaths = {};
  private disposed = false;

  constructor(
    private readonly store: ISettingsStore,
    private readonly elements: DefaultAreaPathsElements,
    private readonly reportError: ReportError,
  ) {}

  init(): void {
    this.elements.addButton.addEventListener("click", this.add);
    this.elements.input.addEventListener("keydown", this.addOnEnter);
    this.elements.list.addEventListener("change", this.change);
    this.elements.list.addEventListener("click", this.remove);
  }

  dispose(): void {
    this.disposed = true;
    this.elements.addButton.removeEventListener("click", this.add);
    this.elements.input.removeEventListener("keydown", this.addOnEnter);
    this.elements.list.removeEventListener("change", this.change);
    this.elements.list.removeEventListener("click", this.remove);
  }

  render(settings: Pick<ExtensionSettings, "defaultAreaPaths" | "sprintAreaPaths">): void {
    if (this.disposed) return;
    this.defaults = [...settings.defaultAreaPaths];
    this.sprintAreaPaths = settings.sprintAreaPaths;
    this.paint();
  }

  private readonly add = (): void => {
    const path = this.elements.input.value.trim();
    if (
      path.length === 0 ||
      normalizeAreaPaths([...this.defaults, path]).length === this.defaults.length
    ) {
      return;
    }
    this.elements.input.value = "";
    this.persist([...this.defaults, path], [path]);
  };

  private readonly addOnEnter = (event: KeyboardEvent): void => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    this.add();
  };

  private readonly change = (event: Event): void => {
    const input = (event.target as Element).closest<HTMLInputElement>("input[data-index]");
    if (input === null) return;
    const index = Number(input.dataset.index);
    const path = input.value.trim();
    if (!Number.isInteger(index) || this.defaults[index] === undefined || path.length === 0) {
      this.paint();
      return;
    }
    const next = [...this.defaults];
    next[index] = path;
    const normalized = normalizeAreaPaths(next);
    if (normalized.length !== next.length) {
      this.paint();
      return;
    }
    this.persist(normalized, [path]);
  };

  private readonly remove = (event: Event): void => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button[data-index]");
    if (button === null) return;
    const index = Number(button.dataset.index);
    if (!Number.isInteger(index) || this.defaults[index] === undefined) return;
    this.persist(
      this.defaults.filter((_, candidate) => candidate !== index),
      [],
    );
  };

  private persist(defaultAreaPaths: string[], addedPaths: readonly string[]): void {
    const previousDefaults = this.defaults;
    const previousSprints = this.sprintAreaPaths;
    const sprintAreaPaths = addPathsToSprints(previousSprints, addedPaths);
    this.defaults = defaultAreaPaths;
    this.sprintAreaPaths = sprintAreaPaths;
    this.paint();
    const update: Partial<ExtensionSettings> = { defaultAreaPaths };
    if (addedPaths.length > 0) update.sprintAreaPaths = sprintAreaPaths;
    void this.store.write(update).catch((error: unknown) => {
      this.defaults = previousDefaults;
      this.sprintAreaPaths = previousSprints;
      this.paint();
      this.reportError(error);
    });
  }

  private paint(): void {
    const doc = this.elements.list.ownerDocument;
    this.elements.list.replaceChildren(
      ...this.defaults.map((path, index) => row(doc, path, index)),
    );
  }
}

function addPathsToSprints(
  selections: SprintAreaPaths,
  addedPaths: readonly string[],
): SprintAreaPaths {
  if (addedPaths.length === 0) return selections;
  return Object.fromEntries(
    Object.entries(selections).map(([sprint, selection]) => [
      sprint,
      { ...selection, areaPaths: normalizeAreaPaths([...selection.areaPaths, ...addedPaths]) },
    ]),
  );
}

function row(doc: Document, path: string, index: number): HTMLElement {
  const root = doc.createElement("div");
  root.className = "default-area-paths__row";
  const input = doc.createElement("input");
  input.type = "text";
  input.value = path;
  input.dataset.index = String(index);
  input.setAttribute("aria-label", `Default area path ${index + 1}`);
  const remove = doc.createElement("button");
  remove.type = "button";
  remove.dataset.index = String(index);
  remove.className = "default-area-paths__remove";
  remove.textContent = "\u00D7";
  remove.title = `Remove ${path}`;
  remove.setAttribute("aria-label", `Remove ${path}`);
  root.append(input, remove);
  return root;
}
