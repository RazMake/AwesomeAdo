import { renderFormRemoveButton } from "../../../../common/view-common/control/FormLayout/FormLayout";

/** One entry of a repeatable group: its controls, and what it currently answers. */
export interface RepeatableEntry<Value> {
  /** Laid out on one line, before the entry's red ×. */
  controls: HTMLElement[];
  /** The entry's value, or null while something it needs is still missing. */
  value(): Value | null;
  /** Whether nothing at all has been typed in it, which makes a missing value harmless. */
  isBlank(): boolean;
  /** Where the caret goes when the entry is added. */
  focus(): void;
}

export interface RepeatableRowsOptions<Value> {
  doc: Document;
  /** The class the group's elements carry, e.g. `awesomeado-new-consumer__detail`. */
  classPrefix: string;
  /** The add button's text, e.g. `Add detail`. */
  addLabel: string;
  /** The remove button's accessible name, e.g. `Remove this detail`. */
  removeLabel: string;
  /** Builds a new entry; `changed` is called whenever something typed in it changes its answer. */
  createEntry(changed: () => void): RepeatableEntry<Value>;
  /** Something in the group changed, so the owner can re-evaluate what the form now allows. */
  onChange(): void;
}

export interface RepeatableRows<Value> {
  element: HTMLElement;
  /** The answers of every complete entry, in order; blank entries are left out. */
  values(): Value[];
  /** Whether an entry has been started but not finished, which must not be silently dropped. */
  hasIncompleteEntry(): boolean;
}

/**
 * A group of entries the reader adds one at a time and removes with a red ×.
 *
 * An entry that was started but not finished is reported rather than dropped, so the owner can
 * hold the form back: losing a half-typed contact on submit is worse than asking for the rest.
 */
export function renderRepeatableRows<Value>(
  options: RepeatableRowsOptions<Value>,
): RepeatableRows<Value> {
  const { doc, classPrefix } = options;
  const entries: RepeatableEntry<Value>[] = [];
  const group = doc.createElement("div");
  group.className = `${classPrefix}s`;
  group.style.cssText = "display:flex;flex-direction:column;gap:4px;min-width:0";
  const list = doc.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:4px;min-width:0";

  const add = doc.createElement("button");
  add.type = "button";
  add.className = `${classPrefix}-add`;
  add.textContent = `+ ${options.addLabel}`;
  add.style.cssText =
    "align-self:flex-start;border:0;padding:0;background:none;cursor:pointer;font:inherit;" +
    "font-size:12px;color:var(--open-command-foreground)";
  add.addEventListener("click", () => {
    const entry = options.createEntry(options.onChange);
    entries.push(entry);
    const line = doc.createElement("div");
    line.className = classPrefix;
    line.style.cssText = "display:flex;align-items:flex-start;gap:6px;min-width:0";
    const remove = renderFormRemoveButton(doc, {
      className: `${classPrefix}-remove`,
      label: options.removeLabel,
      onRemove: () => {
        entries.splice(entries.indexOf(entry), 1);
        line.remove();
        options.onChange();
      },
    });
    line.append(...entry.controls, remove);
    list.append(line);
    entry.focus();
    options.onChange();
  });

  group.append(list, add);
  return {
    element: group,
    values: () =>
      entries.map((entry) => entry.value()).filter((value): value is Value => value !== null),
    hasIncompleteEntry: () => entries.some((entry) => entry.value() === null && !entry.isBlank()),
  };
}
