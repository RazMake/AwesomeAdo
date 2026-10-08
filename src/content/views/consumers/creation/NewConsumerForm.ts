import type { IUserDirectory } from "../../../../common/ado/IUserDirectory";
import type { ILogger } from "../../../../common/logging/ILogger";
import {
  bindFormSubmission,
  renderFormActions,
  renderFormButton,
  renderFormFailureLine,
  renderFormRow,
  renderFormTextField,
} from "../../../../common/view-common/control/FormLayout/FormLayout";
import { renderMarkdownField } from "../../../../common/view-common/control/TextEditor/MarkdownField";

import { renderRepeatableRows, type RepeatableRows } from "./RepeatableRows";
import { createContactEntry, createDetailEntry } from "./consumerFormEntries";
import type { NewConsumerValues } from "./newConsumerDescription";

const PREFIX = "awesomeado-new-consumer";

/** The longest work item title Azure DevOps accepts, which is what the service name becomes. */
const TITLE_MAX_LENGTH = 255;

const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SERVICE_NAME_HELP =
  "Provide a short descriptive name of the service, if that matches what is in the OMAP file, even better";
export const CLIENT_ID_HELP =
  "Provide the ClientId/AppId used to represent this client in the OMAP file. This must be unique to service";

/** The Scenario guidance, naming the service the new consumer is going to call. */
export function scenarioHelp(calledService: string): string {
  return (
    `Provide a short description of the scenario in which ${calledService} will be called. ` +
    "If possible, also provide information about the expected load: number of requests per " +
    "minute, and any other details about the expectations"
  );
}

export interface NewConsumerFormOptions {
  doc: Document;
  userDirectory: IUserDirectory;
  logger: ILogger;
  /** The service consumers call, named in the Scenario guidance. */
  calledService: string;
  /** The client ids existing consumers already state, lowercased; a new one may not repeat them. */
  knownClientIds: ReadonlySet<string>;
  /** Creates the consumer; resolving false keeps the form open with everything typed. */
  onSubmit(values: NewConsumerValues): Promise<boolean>;
  onCancel(): void;
}

/** Why the typed ClientId cannot be used, or null when it can. */
export function clientIdProblem(clientId: string, known: ReadonlySet<string>): string | null {
  if (clientId.length === 0) return "Provide the ClientId.";
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    return "The ClientId must be a GUID, e.g. 00000000-0000-0000-0000-000000000000.";
  }
  return known.has(clientId.toLowerCase()) ? "Another consumer already has this ClientId." : null;
}

interface ConsumerFields {
  serviceName: HTMLInputElement;
  clientId: HTMLInputElement;
  clientIdProblem: HTMLElement;
  scenario: ReturnType<typeof renderMarkdownField>;
  details: RepeatableRows<NewConsumerValues["details"][number]>;
  contacts: RepeatableRows<NewConsumerValues["contacts"][number]>;
}

function renderFields(options: NewConsumerFormOptions, changed: () => void): ConsumerFields {
  const { doc } = options;
  const serviceName = renderFormTextField(doc, {
    className: `${PREFIX}__service-name`,
    help: SERVICE_NAME_HELP,
    maxLength: TITLE_MAX_LENGTH,
  });
  const clientId = renderFormTextField(doc, {
    className: `${PREFIX}__client-id`,
    help: CLIENT_ID_HELP,
  });
  const clientIdProblemLine = doc.createElement("span");
  clientIdProblemLine.className = `${PREFIX}__client-id-problem`;
  clientIdProblemLine.style.cssText = "display:none;font-size:11px;color:var(--error)";
  serviceName.addEventListener("input", changed);
  clientId.addEventListener("input", changed);
  const scenario = renderMarkdownField(doc, {
    initialText: "",
    rows: 4,
    placeholder: `${scenarioHelp(options.calledService)}. Markdown supported.`,
    mentions: { userDirectory: options.userDirectory, logger: options.logger },
    onInput: changed,
  });
  scenario.input.classList.add(`${PREFIX}__scenario`);
  const details = renderRepeatableRows({
    doc,
    classPrefix: `${PREFIX}__detail`,
    addLabel: "Add detail",
    removeLabel: "Remove this detail",
    createEntry: (entryChanged) => createDetailEntry(doc, `${PREFIX}__detail`, entryChanged),
    onChange: changed,
  });
  const contacts = renderRepeatableRows({
    doc,
    classPrefix: `${PREFIX}__contact`,
    addLabel: "Add contact",
    removeLabel: "Remove this contact",
    createEntry: (entryChanged) =>
      createContactEntry(
        {
          doc,
          classPrefix: `${PREFIX}__contact`,
          userDirectory: options.userDirectory,
          logger: options.logger,
        },
        entryChanged,
      ),
    onChange: changed,
  });
  return {
    serviceName,
    clientId,
    clientIdProblem: clientIdProblemLine,
    scenario,
    details,
    contacts,
  };
}

/** Why the form cannot be submitted yet, in the order the reader meets the fields. */
function formProblem(fields: ConsumerFields, known: ReadonlySet<string>): string | null {
  if (fields.serviceName.value.trim().length === 0) return "Provide the service name.";
  const clientId = clientIdProblem(fields.clientId.value.trim(), known);
  if (clientId !== null) return clientId;
  if (fields.details.hasIncompleteEntry()) return "Give every detail a name and a value.";
  if (fields.contacts.hasIncompleteEntry()) return "Give every contact a name.";
  return null;
}

/** The ClientId line says what is wrong only once something has been typed, never as a greeting. */
function showClientIdProblem(fields: ConsumerFields, known: ReadonlySet<string>): void {
  const typed = fields.clientId.value.trim();
  const problem = typed.length === 0 ? null : clientIdProblem(typed, known);
  fields.clientIdProblem.textContent = problem ?? "";
  fields.clientIdProblem.style.display = problem === null ? "none" : "inline";
}

function valuesOf(fields: ConsumerFields): NewConsumerValues {
  return {
    serviceName: fields.serviceName.value.trim(),
    clientId: fields.clientId.value.trim(),
    scenario: fields.scenario.storedText(),
    details: fields.details.values(),
    contacts: fields.contacts.values(),
  };
}

function layOut(options: NewConsumerFormOptions, fields: ConsumerFields): HTMLElement[] {
  const { doc } = options;
  const clientIdControl = doc.createElement("div");
  clientIdControl.style.cssText = "display:flex;flex-direction:column;gap:2px";
  clientIdControl.append(fields.clientId, fields.clientIdProblem);
  const rows = [
    { caption: "Service Name", control: fields.serviceName },
    { caption: "ClientId", control: clientIdControl },
    { caption: "Scenario", control: fields.scenario.element },
    { caption: "Details", control: fields.details.element },
    { caption: "Contacts", control: fields.contacts.element },
  ];
  const laidOut = rows.map((row) => renderFormRow(doc, { classPrefix: PREFIX, ...row }));
  // The row names its control; the typing surfaces inside a wrapper have to carry the name as well.
  fields.clientId.setAttribute("aria-label", "ClientId");
  fields.scenario.input.setAttribute("aria-label", "Scenario");
  return laidOut;
}

/**
 * The Add new consumer form: the service's identity, its scenario, free-form details and the people
 * to contact, which the owner writes into the new consumer's description.
 *
 * Add stays disabled — its tooltip saying why — until the consumer can be told apart from every
 * other: a name, and a ClientId that is a GUID no existing consumer already states. A half-filled
 * detail or contact also holds it back rather than being dropped on the way to Azure DevOps.
 */
export function renderNewConsumerForm(options: NewConsumerFormOptions): HTMLElement {
  const { doc } = options;
  const form = doc.createElement("div");
  form.className = PREFIX;
  form.style.cssText =
    "display:flex;flex-direction:column;gap:8px;min-width:0;max-height:70vh;overflow-y:auto;" +
    "padding-right:4px";
  let refresh = (): void => {};
  const fields = renderFields(options, () => refresh());
  const submit = renderFormButton(doc, PREFIX, "Add", true);
  const cancel = renderFormButton(doc, PREFIX, "Cancel", false);
  const failure = renderFormFailureLine(doc, PREFIX);
  const binding = bindFormSubmission({
    submit,
    cancel,
    failure,
    problem: () => formProblem(fields, options.knownClientIds),
    run: () => options.onSubmit(valuesOf(fields)),
    onCancel: options.onCancel,
  });
  refresh = () => {
    showClientIdProblem(fields, options.knownClientIds);
    binding.refresh();
  };
  form.append(
    ...layOut(options, fields),
    renderFormActions(doc, PREFIX, [submit, cancel], failure),
  );
  queueMicrotask(() => fields.serviceName.focus());
  return form;
}
