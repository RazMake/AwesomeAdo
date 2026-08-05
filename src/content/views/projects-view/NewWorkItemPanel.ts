import type { TrackedUser, TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import type { SprintWindowEntry } from "../../../common/ado/sprintWindow";
import { withWorkItemTag } from "../../../common/ado/workItemTags";
import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";
import { shortestUniqueAreaPathLabels } from "../../../common/view-common/control/AreaPathFilter/AreaPathFilter";
import { renderAssignedTo } from "../../../common/view-common/control/AssignedTo/AssignedTo";
import { renderMarkerPill } from "../../../common/view-common/control/MarkerPill/MarkerPill";
import {
  renderSelectField,
  type SelectFieldChoice,
  type SelectFieldHandle,
} from "../../../common/view-common/control/SelectField/SelectField";
import { sprintRelationDeclarations } from "../../../common/view-common/control/SprintPicker/SprintPicker";
import {
  renderMarkdownField,
  type MarkdownFieldHandle,
} from "../../../common/view-common/control/TextEditor/MarkdownField";

/** Azure DevOps' own limit on `System.Title`; typing past it would only fail at the server. */
const MAX_TITLE_LENGTH = 255;

/** The separator Azure DevOps builds every classification path out of. */
const PATH_SEPARATOR = "\\";

/** One shared declaration list for every text field, so the form cannot look like two forms. */
const FIELD_STYLE =
  "box-sizing:border-box;width:100%;padding:4px 6px;border:1px solid var(--control-border-strong);" +
  "border-radius:4px;background:transparent;color:var(--text-primary-color);font:inherit;font-size:12px";

/** Everything the reader decided, in the shape the creation takes. */
export interface NewWorkItemValues {
  title: string;
  description: string;
  /** The assignee's sign-in address or display name, or null to leave the item unassigned. */
  assignedTo: string | null;
  areaPath: string | null;
  iterationPath: string | null;
  tags: string[];
  /** The acceptance reason, already carrying the team's marker, or null when none was given. */
  comment: string | null;
}

/** What the "Add work item" form needs to describe, default, and persist the item it creates. */
export interface NewWorkItemPanelOptions {
  doc: Document;
  /** The planning item the work is raised under; its paths are what the form opens on. */
  parent: TrackedWorkItem;
  /** The work item type the new item is created as. */
  typeName: string;
  services: EnhancedViewServices;
  /** The area paths in use across the catalog, offered alongside the parent's own. */
  areaPaths: readonly string[];
  /** The people offered the moment the assignee picker opens. */
  assigneeSuggestions: () => TrackedUser[];
  /** Persists the item. Resolving `false` keeps the form open with everything still in it. */
  onCreate(values: NewWorkItemValues): Promise<boolean>;
  onCancel(): void;
}

/**
 * The form that raises a new piece of work under a planning item.
 *
 * A form rather than the inline "type a title" row every other creation here uses, because this is
 * the one creation whose values are NOT all inherited: work found mid-sprint lands with someone, in
 * an area and an iteration, and often as an interrupt that has to say why it was let in. Stating
 * those as facts the way the inline row does would either be a lie or force the reader to go and fix
 * four fields in Azure DevOps immediately afterwards.
 *
 * Everything is written in ONE creation revision (see `NewWorkItem`), so the item never exists in a
 * half-described state that the team's queries would misfile.
 */
export function renderNewWorkItemPanel(options: NewWorkItemPanelOptions): HTMLElement {
  const { doc } = options;
  const form = doc.createElement("div");
  form.className = "awesomeado-new-work-item";
  form.style.cssText = "display:flex;flex-direction:column;gap:8px;min-width:0";

  const title = renderTextField(doc, `New ${options.typeName} title`, MAX_TITLE_LENGTH);
  const description = renderNoteField(options, {
    name: "description",
    caption: "Description",
    rows: 4,
    prompt: "What has to be done?",
  });
  const assignee = renderAssigneeField(options);
  const area = renderAreaField(options);
  const iteration = renderIterationField(options);
  const failure = renderFailureLine(doc);

  const create = renderActionButton(doc, "Create", true);
  const cancel = renderActionButton(doc, "Cancel", false);
  const interrupt = renderInterruptSection(options, () => refreshCreate());

  const refreshCreate = (): void => {
    create.disabled = title.value.trim().length === 0 || !interrupt.isComplete();
  };
  title.addEventListener("input", refreshCreate);
  refreshCreate();

  create.addEventListener("click", () => {
    void submit({ options, title, description, assignee, area, iteration, interrupt }, failure, [
      create,
      cancel,
    ]).then(refreshCreate);
  });
  cancel.addEventListener("click", options.onCancel);

  form.append(
    labelled(doc, "Title", title),
    labelled(doc, "Description", description.element),
    labelled(doc, "Assigned to", assignee.element),
    labelled(doc, "Area path", area.element),
    labelled(doc, "Sprint", iteration.element),
    interrupt.element,
    renderActions(doc, create, cancel, failure),
  );
  // Focused once the element is in the document, so the command that opened the form leaves the
  // caret in the one field nothing can be created without.
  queueMicrotask(() => title.focus());
  return form;
}

/** What one submission reads its answers from. */
interface FormControls {
  options: NewWorkItemPanelOptions;
  title: HTMLInputElement;
  description: MarkdownFieldHandle;
  assignee: AssigneeField;
  area: SelectFieldHandle;
  iteration: SelectFieldHandle;
  interrupt: InterruptSection;
}

/** Gather the form's answers and hand them to the caller, reporting a refusal in place. */
async function submit(
  controls: FormControls,
  failure: HTMLElement,
  buttons: HTMLButtonElement[],
): Promise<void> {
  failure.style.display = "none";
  for (const button of buttons) button.disabled = true;
  const created = await controls.options.onCreate({
    title: controls.title.value.trim(),
    description: controls.description.storedText(),
    assignedTo: controls.assignee.value(),
    areaPath: emptyToNull(controls.area.value()),
    iterationPath: emptyToNull(controls.iteration.value()),
    tags: controls.interrupt.tags(),
    comment: controls.interrupt.comment(),
  });
  for (const button of buttons) button.disabled = false;
  if (created) return;
  // The caller keeps the form mounted on failure, so it says so rather than leaving the reader
  // looking at everything they typed behind buttons that appeared to do nothing.
  failure.textContent = "Not created — see the diagnostics log.";
  failure.style.display = "inline";
}

function emptyToNull(value: string): string | null {
  return value.trim().length === 0 ? null : value;
}

/** One labelled row: the field's name, then the control that answers it. */
function labelled(doc: Document, caption: string, control: HTMLElement): HTMLElement {
  const row = doc.createElement("div");
  row.className = "awesomeado-new-work-item__row";
  row.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0";
  const name = doc.createElement("span");
  name.textContent = caption;
  name.style.cssText = "font-size:11px;font-weight:600;color:var(--text-secondary-color)";
  row.append(name, control);
  control.setAttribute("aria-label", caption);
  return row;
}

function renderTextField(doc: Document, placeholder: string, maxLength: number): HTMLInputElement {
  const field = doc.createElement("input");
  field.type = "text";
  field.className = "awesomeado-new-work-item__title";
  field.placeholder = placeholder;
  field.maxLength = maxLength;
  field.style.cssText = FIELD_STYLE;
  return field;
}

/** What one of the form's authored values is called, how tall it opens, and what it asks for. */
interface NoteFieldSpec {
  /** The class-name suffix this field's elements carry. */
  name: string;
  /** The row's caption, which is also the field's accessible name. */
  caption: string;
  rows: number;
  /** The question the empty box asks. */
  prompt: string;
}

/**
 * One of the form's authored values, typed the way every other authored value in the extension is.
 *
 * The shared Markdown field rather than a bare textarea: what is written here is read back on the
 * boards through the same renderer as anything written in Azure DevOps, so the bold/italic
 * shortcuts, the pasted link and the `@` mentions have to work here too. A plain box that merely
 * CLAIMED Markdown support would leave an author's `@name` as literal text nobody is ever notified
 * about.
 */
function renderNoteField(
  options: NewWorkItemPanelOptions,
  spec: NoteFieldSpec,
): MarkdownFieldHandle {
  const field = renderMarkdownField(options.doc, {
    initialText: "",
    rows: spec.rows,
    placeholder: `${spec.prompt} Markdown supported.`,
    mentions: {
      userDirectory: options.services.userDirectory,
      logger: options.services.logger,
    },
  });
  field.element.classList.add(`awesomeado-new-work-item__${spec.name}-field`);
  field.input.classList.add(`awesomeado-new-work-item__${spec.name}`);
  // The row's caption is a sibling label rather than a `for`-bound one, so the box has to carry the
  // name itself or it is announced as an unnamed edit field.
  field.input.setAttribute("aria-label", spec.caption);
  return field;
}

function renderFailureLine(doc: Document): HTMLElement {
  const failure = doc.createElement("span");
  failure.className = "awesomeado-new-work-item__error";
  failure.style.cssText = "display:none;font-size:11px;color:var(--error)";
  return failure;
}

function renderActionButton(doc: Document, label: string, primary: boolean): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = `awesomeado-new-work-item__${label.toLowerCase()}`;
  button.textContent = label;
  button.style.cssText = [
    "border:1px solid var(--control-border-strong)",
    "border-radius:4px",
    "padding:3px 12px",
    "font:inherit",
    "font-size:12px",
    "cursor:pointer",
    primary
      ? "background:var(--communication-background);color:var(--text-on-communication-background)"
      : "background:transparent;color:var(--text-primary-color)",
  ].join(";");
  return button;
}

function renderActions(
  doc: Document,
  create: HTMLButtonElement,
  cancel: HTMLButtonElement,
  failure: HTMLElement,
): HTMLElement {
  const actions = doc.createElement("div");
  actions.className = "awesomeado-new-work-item__actions";
  actions.style.cssText = "display:flex;align-items:center;gap:6px";
  actions.append(create, cancel, failure);
  return actions;
}

/** The assignee chip plus the sign-in address a successful pick writes. */
interface AssigneeField {
  element: HTMLElement;
  value(): string | null;
}

/**
 * The assignee, opening on whoever is signed in.
 *
 * Defaulted to the reader because work found mid-sprint is normally found by the person about to do
 * it; anyone raising it for someone else is one click from saying so. The identity read is not
 * waited for — a form that cannot be typed into until a round-trip lands would be worse than one
 * that fills a field in a moment later — so a reader who picks first keeps their pick.
 */
function renderAssigneeField(options: NewWorkItemPanelOptions): AssigneeField {
  let chosen: TrackedUser | null = null;
  let picked = false;
  const control = renderAssignedTo(options.doc, {
    user: null,
    userDirectory: options.services.userDirectory,
    suggestions: options.assigneeSuggestions,
    onChange: (user) => {
      picked = true;
      chosen = { displayName: user.displayName, uniqueName: user.uniqueName, imageUrl: null };
      control.setUser(chosen);
    },
  });
  // The chip is only as wide as the name it holds; stretched across the form it would read as a box
  // the reader is meant to type into, which is the one thing it is not.
  control.style.alignSelf = "flex-start";
  void options.services.currentUser?.readCurrentUser().then((me) => {
    if (picked || me === null) return;
    chosen = { displayName: me.displayName, uniqueName: me.uniqueName, imageUrl: null };
    control.setUser(chosen);
  });
  return {
    element: control,
    value: () => chosen?.uniqueName ?? chosen?.displayName ?? null,
  };
}

/**
 * The areas on offer: the leaves of what the catalog uses, named by the shortest label that tells
 * them apart.
 *
 * Leaves only, because an ancestor node is a grouping rather than a place work is done — filing an
 * item on one while its children exist is how a team's own area queries quietly stop finding it.
 * The parent's own area is kept whatever shape it has: it is where this work lands by default, and
 * a form opening on a value it does not offer would silently file the item somewhere else.
 *
 * Derived from the loaded tree rather than read from Azure DevOps: the areas the team's work
 * actually sits in are the ones worth offering, and a project's full area hierarchy is normally a
 * list nobody wants to scroll to find the one they were already in.
 */
function renderAreaField(options: NewWorkItemPanelOptions): SelectFieldHandle {
  const inherited = options.parent.areaPath ?? "";
  const offered = leafPaths(options.areaPaths);
  const paths =
    inherited.length === 0 ? offered : [inherited, ...offered.filter((path) => path !== inherited)];
  const labels = shortestUniqueAreaPathLabels(paths);
  const choices: SelectFieldChoice[] = paths.map((path) => ({
    value: path,
    label: labels.get(path) ?? path,
    title: path,
  }));
  return renderSelectField(options.doc, {
    classPrefix: "awesomeado-new-work-item__area",
    label: "Area path",
    choices:
      inherited.length === 0
        ? [{ value: "", label: "(the project's default area)" }, ...choices]
        : choices,
    selected: inherited,
  });
}

/** The offered paths nothing else is filed beneath, with blanks and duplicates dropped. */
function leafPaths(paths: readonly string[]): string[] {
  const trimmed = [...new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))];
  return trimmed.filter(
    (path) => !trimmed.some((other) => other.startsWith(`${path}${PATH_SEPARATOR}`)),
  );
}

/**
 * The sprint, opening on the team's current one.
 *
 * The sprint window is read when the form opens rather than held by the board: this catalog spans
 * many projects and has no sprint of its own, so nothing else on the surface would ever need it.
 * Until it lands the field offers the parent's iteration, which is where the item would go anyway.
 */
function renderIterationField(options: NewWorkItemPanelOptions): SelectFieldHandle {
  const inherited = options.parent.iterationPath ?? "";
  const field = renderSelectField(options.doc, {
    classPrefix: "awesomeado-new-work-item__iteration",
    label: "Sprint",
    choices: [
      { value: inherited, label: inherited.length === 0 ? "(the project's default)" : inherited },
    ],
    selected: inherited,
    disabled: true,
  });
  void options.services.loadSprintWindow().then((window) => {
    if (window.entries.length > 0) {
      const current = window.entries.find((entry) => entry.relation === "current");
      field.setChoices(window.entries.map(sprintChoice), (current ?? window.entries[0])!.path);
    }
    field.setDisabled(false);
  });
  return field;
}

function sprintChoice(entry: SprintWindowEntry): SelectFieldChoice {
  return {
    value: entry.path,
    label: entry.label,
    title: entry.path,
    // The same declarations the sprint dropdown paints its options with, so past and future read
    // the same here as everywhere else.
    declarations: sprintRelationDeclarations(entry.relation),
  };
}

/** The interrupt controls plus what they contribute to the creation. */
interface InterruptSection {
  element: HTMLElement;
  /** Whether every answer the chosen flags make mandatory has been given. */
  isComplete(): boolean;
  tags(): string[];
  comment(): string | null;
}

/**
 * The Interrupt flag and, once it is accepted into the sprint, the reason it was.
 *
 * The flag is the PILL the item will wear rather than a checkbox beside one: the reader is deciding
 * whether to apply this exact tag, so the control should look like its own outcome — drained of
 * colour while it is off, and once on, painted raised or accepted exactly as every board will paint
 * it. A checkbox says nothing about which of those two the item is about to become.
 *
 * The reason is mandatory because the acceptance is the decision somebody will be asked about at the
 * end of the sprint: an accepted interrupt with no stated reason answers nothing, and by then nobody
 * remembers. It is recorded as a discussion comment carrying the team's own marker, so the same
 * token the board filters accepted interrupts by is the one written here.
 */
function renderInterruptSection(
  options: NewWorkItemPanelOptions,
  onChange: () => void,
): InterruptSection {
  const { doc } = options;
  const tags = options.services.markerTags().interrupt;
  const section = doc.createElement("div");
  section.className = "awesomeado-new-work-item__flags";
  section.style.cssText = "display:flex;flex-direction:column;gap:6px;min-width:0";

  const reason = renderNoteField(options, {
    name: "reason",
    caption: "Acceptance reason",
    rows: 2,
    prompt: "Why is the interrupt accepted in the sprint?",
  });
  const reasonRow = labelled(doc, "Acceptance reason", reason.element);
  reasonRow.style.marginLeft = "18px";
  const accepted = renderCheckbox(doc, "accepted", "Accepted");
  const flag = renderInterruptFlag(doc, tags.tag, () => accepted.box.checked);
  section.append(interruptRow(doc, flag.element, accepted.label), reasonRow);

  if (tags.tag.length === 0) {
    flag.element.disabled = true;
    flag.element.title =
      'No Azure DevOps tag is configured for "Interrupt". Set one under Options → Azure DevOps.';
  }
  if (tags.commentTag.length === 0) {
    accepted.box.disabled = true;
    accepted.label.title = "No acceptance comment tag is configured for Interrupt.";
  }

  const showRows = (): void => {
    accepted.label.style.display = flag.isOn() ? "flex" : "none";
    reasonRow.style.display = flag.isOn() && accepted.box.checked ? "flex" : "none";
    flag.repaint();
  };
  const paint = (): void => {
    showRows();
    onChange();
  };
  flag.onToggle(paint);
  accepted.box.addEventListener("change", paint);
  reason.input.addEventListener("input", onChange);
  // Laid out without reporting: nothing has been chosen yet, and the form's own Create button is
  // still being wired when this runs.
  showRows();

  const isAccepted = (): boolean => flag.isOn() && accepted.box.checked;
  return {
    element: section,
    isComplete: () => !isAccepted() || reason.input.value.trim().length > 0,
    tags: () => (flag.isOn() ? withWorkItemTag([], tags.tag) : []),
    comment: () => (isAccepted() ? `${tags.commentTag} ${reason.storedText().trim()}` : null),
  };
}

/** The flag and its acceptance side by side: one decision, so one line. */
function interruptRow(doc: Document, flag: HTMLElement, accepted: HTMLElement): HTMLElement {
  const row = doc.createElement("div");
  row.className = "awesomeado-new-work-item__interrupt-row";
  row.style.cssText = "display:flex;align-items:center;gap:12px;min-width:0";
  row.append(flag, accepted);
  return row;
}

/** The Interrupt pill as a toggle, plus the state and the repaint its owner drives it through. */
interface InterruptFlag {
  element: HTMLButtonElement;
  isOn(): boolean;
  /** Redraw the pill after something it reflects — the acceptance — changed. */
  repaint(): void;
  onToggle(handler: () => void): void;
}

/**
 * The pill that says whether this work is an interrupt and, once it is, whether it was accepted.
 *
 * A bare button carrying the SHARED pill rather than one drawn here: the colour is the entire
 * meaning of a marker, so the pill a reader is about to apply has to come from the same control the
 * boards paint it with, or the preview and the outcome drift apart. Nesting it inside the button
 * keeps the toggle one focusable, announceable control instead of a checkbox with a picture beside
 * it.
 */
function renderInterruptFlag(doc: Document, tag: string, isAccepted: () => boolean): InterruptFlag {
  let on = false;
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "awesomeado-new-work-item__interrupt";
  button.style.cssText =
    "display:inline-flex;align-items:center;padding:0;border:0;background:none;cursor:pointer";

  const repaint = (): void => {
    const pill = renderMarkerPill(doc, {
      marker: "interrupt",
      accepted: on && isAccepted(),
      title: tag.length === 0 ? undefined : `Tag "${tag}"`,
    });
    if (!on) {
      pill.style.filter = "grayscale(1)";
      pill.style.opacity = "0.45";
    }
    button.setAttribute("aria-pressed", String(on));
    button.style.cursor = button.disabled ? "default" : "pointer";
    button.replaceChildren(pill);
  };
  repaint();

  return {
    element: button,
    isOn: () => on,
    repaint,
    onToggle: (handler) =>
      button.addEventListener("click", () => {
        on = !on;
        handler();
      }),
  };
}

/** A checkbox and the label it lives in, so the caller can show, hide, or extend the row. */
function renderCheckbox(
  doc: Document,
  name: string,
  caption: string,
): { label: HTMLLabelElement; box: HTMLInputElement } {
  const label = doc.createElement("label");
  label.className = `awesomeado-new-work-item__${name}-row`;
  label.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer";
  const box = doc.createElement("input");
  box.type = "checkbox";
  box.className = `awesomeado-new-work-item__${name}`;
  box.style.cssText = "margin:0;accent-color:var(--communication-background)";
  label.append(box, doc.createTextNode(caption));
  return { label, box };
}
