import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLIENT_ID_HELP,
  clientIdProblem,
  renderNewConsumerForm,
  scenarioHelp,
  SERVICE_NAME_HELP,
} from "./NewConsumerForm";
import type { NewConsumerValues } from "./newConsumerDescription";

const PREFIX = "awesomeado-new-consumer";
const CLIENT_ID = "11111111-2222-3333-4444-555555555555";
const TAKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const NOT_CREATED = "Not created \u2014 see the diagnostics log.";

function type(input: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input"));
}

function element<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`Nothing matches ${selector}`);
  return found;
}

/** The form mounted in the document, with its controls found by class. */
function form(onSubmit: (values: NewConsumerValues) => Promise<boolean> = async () => true) {
  const submit = vi.fn(onSubmit);
  const onCancel = vi.fn();
  const root = renderNewConsumerForm({
    doc: document,
    userDirectory: { search: async () => [], resolve: async () => null },
    logger: { info: vi.fn(), error: vi.fn() },
    calledService: "Billing API",
    knownClientIds: new Set([TAKEN]),
    onSubmit: submit,
    onCancel,
  });
  document.body.append(root);
  return {
    root,
    submit,
    onCancel,
    serviceName: element<HTMLInputElement>(root, `.${PREFIX}__service-name`),
    clientId: element<HTMLInputElement>(root, `.${PREFIX}__client-id`),
    problemLine: element<HTMLElement>(root, `.${PREFIX}__client-id-problem`),
    scenario: element<HTMLTextAreaElement>(root, `.${PREFIX}__scenario`),
    add: element<HTMLButtonElement>(root, `.${PREFIX}__add`),
    cancel: element<HTMLButtonElement>(root, `.${PREFIX}__cancel`),
    failure: element<HTMLElement>(root, `.${PREFIX}__error`),
  };
}

type Form = ReturnType<typeof form>;

function fillIdentity(view: Form): void {
  type(view.serviceName, "Contoso");
  type(view.clientId, CLIENT_ID);
}

/** Add one entry to the group with the given class and return the line it was added on. */
function addEntry(view: Form, group: "detail" | "contact"): HTMLElement {
  element<HTMLButtonElement>(view.root, `.${PREFIX}__${group}-add`).click();
  const lines = view.root.querySelectorAll<HTMLElement>(`.${PREFIX}__${group}`);
  const line = lines[lines.length - 1];
  if (line === undefined) throw new Error(`No ${group} line was added`);
  return line;
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("clientIdProblem", () => {
  it("asks for a missing ClientId", () => {
    expect(clientIdProblem("", new Set())).toBe("Provide the ClientId.");
  });

  it("refuses a ClientId that is not a GUID", () => {
    expect(clientIdProblem("not-a-guid", new Set())).toBe(
      "The ClientId must be a GUID, e.g. 00000000-0000-0000-0000-000000000000.",
    );
  });

  it("refuses a ClientId another consumer already states, whatever its case", () => {
    expect(clientIdProblem(TAKEN.toUpperCase(), new Set([TAKEN]))).toBe(
      "Another consumer already has this ClientId.",
    );
  });

  it("accepts a new GUID", () => {
    expect(clientIdProblem(CLIENT_ID.toUpperCase(), new Set([TAKEN]))).toBeNull();
  });
});

describe("renderNewConsumerForm — guidance", () => {
  it("shows the guidance for the service name, the ClientId and the scenario as ghost text", () => {
    const view = form();

    expect(view.root.querySelector(`.${PREFIX}__help`)).toBeNull();
    expect(view.serviceName.placeholder).toBe(SERVICE_NAME_HELP);
    expect(view.serviceName.title).toBe(SERVICE_NAME_HELP);
    expect(view.clientId.placeholder).toBe(CLIENT_ID_HELP);
    expect(view.scenario.placeholder).toBe(`${scenarioHelp("Billing API")}. Markdown supported.`);
    expect(scenarioHelp("Billing API")).toContain("in which Billing API will be called");
  });

  it("names the typing surfaces and focuses the service name", async () => {
    const view = form();
    await settle();

    expect(view.clientId.getAttribute("aria-label")).toBe("ClientId");
    expect(view.scenario.getAttribute("aria-label")).toBe("Scenario");
    expect(document.activeElement).toBe(view.serviceName);
  });
});

describe("renderNewConsumerForm — readiness", () => {
  it("keeps Add disabled, saying why, until a service name and a valid ClientId are given", () => {
    const view = form();
    expect(view.add.disabled).toBe(true);
    expect(view.add.title).toBe("Provide the service name.");

    type(view.serviceName, "  Contoso ");
    expect(view.add.title).toBe("Provide the ClientId.");

    type(view.clientId, CLIENT_ID);
    expect(view.add.disabled).toBe(false);
    expect(view.add.title).toBe("");
  });

  it("explains an invalid ClientId under the field, and hides that once it is cleared", () => {
    const view = form();
    expect(view.problemLine.style.display).toBe("none");

    type(view.clientId, "12345");
    expect(view.problemLine.style.display).toBe("inline");
    expect(view.problemLine.textContent).toBe(clientIdProblem("12345", new Set()));

    type(view.clientId, "  ");
    expect(view.problemLine.style.display).toBe("none");
    expect(view.problemLine.textContent).toBe("");
  });

  it("explains a ClientId another consumer already states, whatever its case", () => {
    const view = form();
    type(view.serviceName, "Contoso");

    type(view.clientId, TAKEN.toUpperCase());

    expect(view.problemLine.textContent).toBe("Another consumer already has this ClientId.");
    expect(view.add.disabled).toBe(true);
    expect(view.add.title).toBe("Another consumer already has this ClientId.");
  });
});

describe("renderNewConsumerForm — incomplete entries", () => {
  it("holds Add back while a detail has a name but no value", () => {
    const view = form();
    fillIdentity(view);
    const line = addEntry(view, "detail");

    type(element<HTMLInputElement>(line, `.${PREFIX}__detail-name`), "Requirements");
    expect(view.add.disabled).toBe(true);
    expect(view.add.title).toBe("Give every detail a name and a value.");

    type(element<HTMLInputElement>(line, `.${PREFIX}__detail-value`), "https://spec.example");
    expect(view.add.disabled).toBe(false);
  });

  it("holds Add back while a contact has an alias but no name", () => {
    const view = form();
    fillIdentity(view);
    const line = addEntry(view, "contact");
    expect(view.add.disabled).toBe(false);

    type(element<HTMLInputElement>(line, `.${PREFIX}__contact-alias`), "jdoe");

    expect(view.add.disabled).toBe(true);
    expect(view.add.title).toBe("Give every contact a name.");
  });
});

describe("renderNewConsumerForm — submitting", () => {
  it("hands the trimmed answers to the owner", async () => {
    const view = form();
    type(view.serviceName, "  Contoso ");
    type(view.clientId, ` ${CLIENT_ID} `);
    type(view.scenario, "Calls us nightly.");
    const detail = addEntry(view, "detail");
    type(element<HTMLInputElement>(detail, `.${PREFIX}__detail-name`), " Load ");
    type(element<HTMLInputElement>(detail, `.${PREFIX}__detail-value`), " 10 rpm ");
    const person = addEntry(view, "contact");
    type(element<HTMLInputElement>(person, `input.${PREFIX}__contact-name`), " Jane Doe ");
    type(element<HTMLInputElement>(person, `.${PREFIX}__contact-alias`), " jdoe ");
    addEntry(view, "contact");

    view.add.click();
    await settle();

    expect(view.submit).toHaveBeenCalledWith({
      serviceName: "Contoso",
      clientId: CLIENT_ID,
      scenario: "Calls us nightly.",
      details: [{ name: "Load", value: "10 rpm" }],
      contacts: [{ fullName: "Jane Doe", alias: "jdoe", role: "M1" }],
    });
    expect(view.failure.style.display).toBe("none");
  });

  it("keeps the form and says so when the owner could not create the consumer", async () => {
    const view = form(async () => false);
    fillIdentity(view);

    view.add.click();
    await settle();

    expect(view.failure.style.display).toBe("inline");
    expect(view.failure.textContent).toBe(NOT_CREATED);
    expect(view.serviceName.value).toBe("Contoso");
    expect(view.add.disabled).toBe(false);
  });

  it("calls onCancel when Cancel is clicked", () => {
    const view = form();

    view.cancel.click();

    expect(view.onCancel).toHaveBeenCalledTimes(1);
    expect(view.submit).not.toHaveBeenCalled();
  });
});
