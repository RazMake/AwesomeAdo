import { normalizeAreaPaths } from "../../common/settings/SprintAreaPaths";
import { AutocompleteInput } from "../ado-config/AutocompleteInput";

/** Edits a newline-backed list as one autocomplete row per full Azure DevOps area path. */
export class AreaPathListEditor {
  readonly root: HTMLElement;

  private readonly addInput: HTMLInputElement;
  private readonly addButton: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly addAutocomplete: AutocompleteInput;
  private rowAutocompletes: AutocompleteInput[] = [];
  private paths: string[];

  constructor(
    doc: Document,
    stored: string,
    private readonly suggestions: readonly string[],
    description: string,
    private readonly onChange: () => void,
  ) {
    this.paths = normalizeAreaPaths(stored.split(/\r?\n/));
    this.root = doc.createElement("div");
    this.root.className = "area-path-list-editor";

    const addRow = doc.createElement("div");
    addRow.className = "area-path-list-editor__add";
    this.addInput = doc.createElement("input");
    this.addInput.type = "text";
    this.addInput.placeholder = "Project\\Area";
    this.addInput.setAttribute("aria-label", "New default Lane area path");
    this.addAutocomplete = new AutocompleteInput(this.addInput);
    this.addAutocomplete.setOptions(suggestions);

    this.addButton = doc.createElement("button");
    this.addButton.type = "button";
    this.addButton.className = "button button--subtle";
    this.addButton.textContent = "Add";
    this.addButton.addEventListener("click", this.add);
    this.addInput.addEventListener("input", this.syncAddEnabled);
    this.addInput.addEventListener("keydown", this.addOnEnter);
    addRow.append(this.addAutocomplete.root, this.addButton);

    const hint = doc.createElement("p");
    hint.className = "field__hint area-path-list-editor__hint";
    hint.textContent = description;

    this.list = doc.createElement("div");
    this.list.className = "area-path-list-editor__list";
    this.root.append(addRow, hint, this.list);
    this.syncAddEnabled();
    this.paint();
  }

  get value(): string {
    return this.paths.join("\n");
  }

  dispose(): void {
    this.addButton.removeEventListener("click", this.add);
    this.addInput.removeEventListener("input", this.syncAddEnabled);
    this.addInput.removeEventListener("keydown", this.addOnEnter);
    this.addAutocomplete.dispose();
    this.disposeRows();
  }

  private readonly add = (): void => {
    const next = normalizeAreaPaths([...this.paths, this.addInput.value]);
    if (next.length === this.paths.length) return;
    this.paths = next;
    this.addInput.value = "";
    this.syncAddEnabled();
    this.changed();
  };

  private readonly syncAddEnabled = (): void => {
    this.addButton.disabled = this.addInput.value.trim().length === 0;
  };

  private readonly addOnEnter = (event: KeyboardEvent): void => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    this.add();
  };

  private replace(index: number, value: string): void {
    const candidate = [...this.paths];
    candidate[index] = value;
    const next = normalizeAreaPaths(candidate);
    if (next.length !== candidate.length) {
      this.paint();
      return;
    }
    this.paths = next;
    this.changed();
  }

  private remove(index: number): void {
    this.paths = this.paths.filter((_, candidate) => candidate !== index);
    this.changed();
  }

  private changed(): void {
    this.paint();
    this.onChange();
  }

  private paint(): void {
    this.disposeRows();
    const doc = this.list.ownerDocument;
    const rows = this.paths.map((path, index) => {
      const row = doc.createElement("div");
      row.className = "area-path-list-editor__row";
      const input = doc.createElement("input");
      input.type = "text";
      input.value = path;
      input.setAttribute("aria-label", `Default Lane area path ${index + 1}`);
      input.addEventListener("change", () => this.replace(index, input.value));
      const autocomplete = new AutocompleteInput(input);
      autocomplete.setOptions(this.suggestions);
      this.rowAutocompletes.push(autocomplete);

      const remove = doc.createElement("button");
      remove.type = "button";
      remove.className = "area-path-list-editor__remove";
      remove.textContent = "\u00D7";
      remove.title = `Remove ${path}`;
      remove.setAttribute("aria-label", `Remove ${path}`);
      remove.addEventListener("click", () => this.remove(index));
      row.append(autocomplete.root, remove);
      return row;
    });
    this.list.replaceChildren(...rows);
  }

  private disposeRows(): void {
    for (const autocomplete of this.rowAutocompletes) autocomplete.dispose();
    this.rowAutocompletes = [];
  }
}
