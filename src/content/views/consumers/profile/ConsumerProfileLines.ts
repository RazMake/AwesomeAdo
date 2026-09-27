import type { DirectoryUser, IUserDirectory } from "../../../../common/ado/IUserDirectory";
import {
  attachPeoplePicker,
  renderAssignedTo,
} from "../../../../common/view-common/control/AssignedTo/AssignedTo";

import type {
  ConsumerContact,
  ConsumerProfile,
  ConsumerProfileReading,
  ContactShape,
} from "./consumerProfile";

const PREFIX = "awesomeado-consumers";

/** Why a rich-text description's contacts are shown but cannot be changed from the card. */
export const RICH_TEXT_CONTACTS_REASON = "The description has to be Markdown to be editable.";

/**
 * Why a contact written any way but on a line of its own cannot be changed from the card: rewriting
 * that line would rewrite the other text it shares the line with.
 */
export const SHARED_CONTACT_REASONS: Readonly<Record<Exclude<ContactShape, "own-line">, string>> = {
  "shared-line":
    "This contact shares its line in the description with other people, so it can only be " +
    "changed in Azure DevOps.",
  "table-row":
    "This contact is written in a table in the description, so it can only be changed in " +
    "Azure DevOps.",
  inline:
    "This contact is written outside the description's Contacts section, so it can only be " +
    "changed in Azure DevOps.",
};

const NAME_TEXT = "font-weight:700;color:var(--text-primary-color)";
const MUTED_TEXT = "color:var(--text-secondary-color)";
const LABEL_TEXT = "font-weight:700;color:var(--text-secondary-color)";
/** Identifiers are read character by character (a GUID), so they are set in monospace. */
const IDENTIFIER_TEXT = [
  "font-family:monospace",
  "font-size:10px",
  "color:var(--text-secondary-color)",
  "background:var(--control-background-muted)",
  "border-radius:3px",
  "padding:0 4px",
].join(";");

/**
 * How the contacts on one card are changed. Every change is only a REQUEST: the card is redrawn
 * from the description once it has been written, so nothing here repaints itself.
 */
export interface ContactEditing {
  /** Where the people picker looks people up. */
  userDirectory: IUserDirectory;
  /** Every role already given to someone on this board, offered as one-click choices. */
  roles: readonly string[];
  /** Add `person` to the contacts, with no role yet. */
  onAdd(person: DirectoryUser): void;
  /** Put `person` in place of the `index`-th contact. */
  onReplace(index: number, person: DirectoryUser): void;
  /** Give the `index`-th contact `role`. */
  onRoleChange(index: number, role: string): void;
  /** Take the `index`-th contact off the description. */
  onRemove(index: number): void;
}

/** The editing hooks plus why they are switched off, or null while they work. */
type ContactsControl = ContactEditing & { readOnlyReason: string | null };

/**
 * The service identity and contacts a consumer's description carries.
 *
 * The Contacts heading is always shown: a description written line by line (Markdown or plain
 * text) can take its first person from its `+`, and a rich-text one — shown but not editable — is
 * where the reader learns why, from the tooltip over the section.
 */
export function renderConsumerProfileLines(
  doc: Document,
  reading: ConsumerProfileReading,
  editing: ContactEditing,
): HTMLElement {
  const control: ContactsControl = {
    ...editing,
    readOnlyReason: reading.layout.sourceLines === null ? RICH_TEXT_CONTACTS_REASON : null,
  };
  const shapes = reading.layout.entries.map(({ shape }) => shape);
  const lines = [
    renderIdentityLine(doc, reading.profile),
    renderContacts(doc, reading.profile.contacts, shapes, control),
  ].filter((line): line is HTMLElement => line !== null);
  const block = doc.createElement("div");
  block.className = `${PREFIX}__profile`;
  block.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "align-items:flex-start",
    "gap:4px",
    "min-width:0",
    "font-size:11px",
  ].join(";");
  block.append(...lines);
  return block;
}

/** `ServiceName (client id)`, with either half left out when the description never gave it. */
function renderIdentityLine(doc: Document, profile: ConsumerProfile): HTMLElement | null {
  if (profile.serviceName === null && profile.clientId === null) return null;
  const line = doc.createElement("div");
  line.className = `${PREFIX}__identity`;
  line.style.cssText = "display:flex;align-items:baseline;flex-wrap:wrap;gap:4px";
  if (profile.serviceName !== null) {
    line.append(
      renderSpan(doc, `${PREFIX}__service-name`, profile.serviceName, NAME_TEXT, "Service name"),
    );
  }
  if (profile.clientId !== null) {
    line.append(
      parenthesize(
        doc,
        renderSpan(doc, `${PREFIX}__client-id`, profile.clientId, IDENTIFIER_TEXT, "Client ID"),
      ),
    );
  }
  return line;
}

/** The Contacts heading with its add button, over one contact pill per line. */
function renderContacts(
  doc: Document,
  contacts: readonly ConsumerContact[],
  shapes: readonly ContactShape[],
  control: ContactsControl,
): HTMLElement {
  const section = doc.createElement("div");
  section.className = `${PREFIX}__contacts`;
  section.style.cssText = "display:flex;flex-direction:column;align-items:flex-start;gap:3px";
  if (control.readOnlyReason !== null) section.title = control.readOnlyReason;
  const heading = doc.createElement("div");
  heading.className = `${PREFIX}__contacts-heading`;
  heading.style.cssText = "display:flex;align-items:center;gap:6px";
  heading.append(
    renderSpan(doc, `${PREFIX}__contacts-label`, "Contacts", LABEL_TEXT),
    renderAddContact(doc, control),
  );
  section.append(heading);
  if (contacts.length > 0) {
    const list = doc.createElement("ul");
    list.className = `${PREFIX}__contact-list`;
    list.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "align-items:flex-start",
      "gap:3px",
      "margin:0",
      "padding:0",
      "list-style:none",
    ].join(";");
    contacts.forEach((contact, index) =>
      list.append(renderContact(doc, contact, index, controlForContact(shapes[index], control))),
    );
    section.append(list);
  }
  return section;
}

/** The section's control, switched off for a contact that cannot be rewritten on its own line. */
function controlForContact(
  shape: ContactShape | undefined,
  control: ContactsControl,
): ContactsControl {
  const reason =
    control.readOnlyReason ??
    (shape === undefined || shape === "own-line" ? null : SHARED_CONTACT_REASONS[shape]);
  return { ...control, readOnlyReason: reason };
}

/**
 * One contact, drawn as the assignee pill the other boards use: a red × that takes them off the
 * list, the person's name, which opens the people picker to put someone else in their place, and
 * their role as the tag pill beside it ("??" until they are given one). The alias is how the
 * description tells two people of the same name apart, not something the reader scans for, so it is
 * kept to the tooltip.
 */
function renderContact(
  doc: Document,
  contact: ConsumerContact,
  index: number,
  control: ContactsControl,
): HTMLElement {
  const editable = control.readOnlyReason === null;
  const item = doc.createElement("li");
  item.className = `${PREFIX}__contact`;
  item.style.display = "flex";
  const chip = renderAssignedTo(doc, {
    user: {
      displayName: contact.fullName,
      uniqueName: contact.alias,
      imageUrl: null,
      tag: contact.role,
    },
    userDirectory: control.userDirectory,
    showTag: true,
    assignableTags: [...control.roles],
    newTagPlaceholder: "Add new role",
    onChange: editable ? (person) => control.onReplace(index, person) : undefined,
    onTagChange: editable ? (role) => control.onRoleChange(index, role) : undefined,
    onRemove: editable ? () => control.onRemove(index) : undefined,
    removeLabel: `Remove ${contact.fullName} from the contacts`,
  });
  // Primary text and an outline, so a contact reads with the weight the card gave it before it
  // became an assignee pill — the shared chip's muted, borderless default is tuned for dense rows.
  chip.style.setProperty("--assigned-to-text-color", "var(--text-primary-color)");
  chip.style.border = "1px solid var(--control-border)";
  // The outline costs a pixel on each side; giving it back keeps the pill as tall as any other.
  chip.style.padding = "3px 4px";
  chip.title = contact.alias === null ? contact.fullName : `Alias: ${contact.alias}`;
  if (!editable) lockName(chip, control.readOnlyReason ?? "");
  item.append(chip);
  return item;
}

/** Switch off the name's people picker, leaving the reason in the pill's tooltip. */
function lockName(chip: HTMLElement, reason: string): void {
  const name = chip.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");
  if (name === null) return;
  name.disabled = true;
  name.style.cursor = "default";
  chip.title = `${chip.title}\n${reason}`;
}

/**
 * The small `+` that opens the people picker to add a contact.
 *
 * While the description cannot be edited the button stays on screen, marked unavailable rather than
 * `disabled`, so it can still take focus and its tooltip can say why.
 */
function renderAddContact(doc: Document, control: ContactsControl): HTMLElement {
  const anchor = doc.createElement("span");
  anchor.className = `${PREFIX}__add-contact`;
  anchor.style.cssText = "position:relative;display:inline-flex";
  const button = doc.createElement("button");
  button.type = "button";
  button.className = `${PREFIX}__add-contact-button`;
  button.textContent = "+";
  button.setAttribute("aria-label", "Add a contact");
  button.title = control.readOnlyReason ?? "Add a contact";
  button.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "width:16px",
    "height:16px",
    "padding:0",
    "border:1px solid var(--control-border)",
    "border-radius:50%",
    "background:var(--control-background-subtle)",
    "color:var(--text-secondary-color)",
    "font:inherit",
    "font-size:12px",
    "line-height:1",
    "cursor:pointer",
  ].join(";");
  anchor.append(button);
  if (control.readOnlyReason !== null) {
    button.setAttribute("aria-disabled", "true");
    button.style.cursor = "default";
    button.style.opacity = "0.5";
    return anchor;
  }
  attachPeoplePicker({
    doc,
    anchor,
    trigger: button,
    userDirectory: control.userDirectory,
    onPick: (person) => control.onAdd(person),
  });
  return anchor;
}

/** Wraps a value in muted parentheses, the way the description itself writes these. */
function parenthesize(doc: Document, value: HTMLElement): HTMLElement {
  const wrapper = doc.createElement("span");
  wrapper.className = `${PREFIX}__parenthesized`;
  wrapper.style.cssText = `display:inline-flex;align-items:baseline;${MUTED_TEXT}`;
  wrapper.append(doc.createTextNode("("), value, doc.createTextNode(")"));
  return wrapper;
}

function renderSpan(
  doc: Document,
  className: string,
  text: string,
  css: string,
  title?: string,
): HTMLElement {
  const span = doc.createElement("span");
  span.className = className;
  span.textContent = text;
  span.style.cssText = css;
  if (title !== undefined) span.title = title;
  return span;
}
