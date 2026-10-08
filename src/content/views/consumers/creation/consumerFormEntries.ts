import type { IUserDirectory } from "../../../../common/ado/IUserDirectory";
import type { ILogger } from "../../../../common/logging/ILogger";
import { renderFormTextField } from "../../../../common/view-common/control/FormLayout/FormLayout";
import { renderSelectField } from "../../../../common/view-common/control/SelectField/SelectField";
import { aliasOfUniqueName } from "../profile/ConsumerContactEditor";
import type { ConsumerContact } from "../profile/consumerProfile";

import { renderContactNameField } from "./ContactNameField";
import type { RepeatableEntry } from "./RepeatableRows";
import type { ConsumerDetailEntry } from "./newConsumerDescription";

/** The roles a new contact can hold, in the order the onboarding template lists them. */
export const CONTACT_ROLES = ["M1", "M2", "M3", "Dev", "PM", "CVP"] as const;

export const DETAIL_NAME_HELP = "The name of the field";
export const DETAIL_VALUE_HELP = "The value for the field, links, text, etc.";

function trimmedOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A text box sized to share one line with its siblings, its guidance shown as ghost text. */
function lineField(
  doc: Document,
  options: { className: string; name: string; help: string; flex: string },
): HTMLInputElement {
  const field = renderFormTextField(doc, { className: options.className, help: options.help });
  field.setAttribute("aria-label", options.name);
  field.style.flex = options.flex;
  field.style.minWidth = "0";
  return field;
}

/** One Details line: a field name and its value, complete only once both are given. */
export function createDetailEntry(
  doc: Document,
  classPrefix: string,
  changed: () => void,
): RepeatableEntry<ConsumerDetailEntry> {
  const name = lineField(doc, {
    className: `${classPrefix}-name`,
    name: "Field name",
    help: DETAIL_NAME_HELP,
    flex: "0 0 160px",
  });
  const value = lineField(doc, {
    className: `${classPrefix}-value`,
    name: "Field value",
    help: DETAIL_VALUE_HELP,
    flex: "1 1 0",
  });
  name.addEventListener("input", changed);
  value.addEventListener("input", changed);
  return {
    controls: [name, value],
    value: () => {
      const typedName = trimmedOrNull(name.value);
      const typedValue = trimmedOrNull(value.value);
      return typedName === null || typedValue === null
        ? null
        : { name: typedName, value: typedValue };
    },
    isBlank: () => trimmedOrNull(name.value) === null && trimmedOrNull(value.value) === null,
    focus: () => name.focus(),
  };
}

/** What a contact line needs to look its people up. */
export interface ContactEntryOptions {
  doc: Document;
  classPrefix: string;
  userDirectory: IUserDirectory;
  logger: ILogger;
}

/**
 * One Contacts line: the person's name, their alias, and the role they hold.
 *
 * The alias follows the directory only while the reader has not typed one of their own: a looked-up
 * alias replaces the one the previous lookup filled in, never one the reader wrote, because they know
 * this consumer's people better than a name search does.
 */
export function createContactEntry(
  options: ContactEntryOptions,
  changed: () => void,
): RepeatableEntry<ConsumerContact> {
  const { doc, classPrefix } = options;
  const alias = lineField(doc, {
    className: `${classPrefix}-alias`,
    name: "Alias",
    help: "Alias",
    flex: "0 0 110px",
  });
  let filledAlias: string | null = null;
  const name = renderContactNameField({
    doc,
    className: `${classPrefix}-name`,
    userDirectory: options.userDirectory,
    logger: options.logger,
    onResolve: (user) => {
      const resolved = aliasOfUniqueName(user.uniqueName);
      if (resolved === null) return;
      if (trimmedOrNull(alias.value) !== null && alias.value !== filledAlias) return;
      alias.value = resolved;
      filledAlias = resolved;
      changed();
    },
    onInput: changed,
  });
  name.input.setAttribute("aria-label", "Name");
  alias.addEventListener("input", changed);
  const role = renderSelectField(doc, {
    classPrefix: `${classPrefix}-role`,
    label: "Role",
    choices: CONTACT_ROLES.map((value) => ({ value, label: value })),
    selected: CONTACT_ROLES[0],
  });
  role.element.style.flex = "0 0 72px";
  return {
    controls: [name.element, alias, role.element],
    value: () => {
      const fullName = name.value();
      if (fullName.length === 0) return null;
      return { fullName, alias: trimmedOrNull(alias.value), role: role.value() };
    },
    isBlank: () => name.value().length === 0 && trimmedOrNull(alias.value) === null,
    focus: () => name.input.focus(),
  };
}
