import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";

import { renderNewWorkItemPanel, type NewWorkItemValues } from "./NewWorkItemPanel";

const PARENT: TrackedWorkItem = {
  id: 7,
  rev: 3,
  type: "Feature",
  title: "Card capture",
  state: "Active",
  priority: null,
  assignedTo: null,
  areaPath: "Fabrikam\\Payments",
  iterationPath: "Fabrikam\\Backlog",
  sprintName: null,
  createdDate: "2026-07-01T00:00:00Z",
  createdBy: null,
  changedDate: "2026-07-01T00:00:00Z",
  changedBy: null,
  stateChangeDate: "2026-07-01T00:00:00Z",
  description: "",
  noteCount: 0,
  tags: [],
  importance: 1,
  eta: null,
  children: [],
};

const SPRINTS = {
  entries: [
    {
      path: "Fabrikam\\Sprint 4",
      name: "Sprint 4",
      label: "Previous - Sprint 4",
      relation: "past",
    },
    {
      path: "Fabrikam\\Sprint 5",
      name: "Sprint 5",
      label: "Current - Sprint 5",
      relation: "current",
    },
    { path: "Fabrikam\\Sprint 6", name: "Sprint 6", label: "Next - Sprint 6", relation: "future" },
  ],
  currentName: "Sprint 5",
} as Awaited<ReturnType<EnhancedViewServices["loadSprintWindow"]>>;

function services(overrides?: Partial<EnhancedViewServices>): EnhancedViewServices {
  return {
    userDirectory: { search: async () => [], resolve: async () => null },
    currentUser: {
      readCurrentUser: async () => ({
        displayName: "Ada Lovelace",
        id: "guid",
        uniqueName: "ada@example.com",
      }),
    },
    loadSprintWindow: async () => SPRINTS,
    markerTags: () => ({
      blocked: { tag: "Blocked", commentTag: "[BLOCKED]" },
      blockedByOtherTeam: { tag: "Blocked by another team", commentTag: "[ACCEPTED]" },
      interrupt: { tag: "Interrupt", commentTag: "[ACCEPTED]" },
    }),
    logger: { info: () => undefined, error: () => undefined },
    ...overrides,
  } as EnhancedViewServices;
}

/** Mount the form and let the identity read and the sprint read settle. */
async function mount(overrides?: Partial<EnhancedViewServices>, areaPaths?: readonly string[]) {
  const onCreate = vi.fn<(values: NewWorkItemValues) => Promise<boolean>>().mockResolvedValue(true);
  const onCancel = vi.fn();
  const form = renderNewWorkItemPanel({
    doc: document,
    parent: PARENT,
    typeName: "Story",
    services: services(overrides),
    areaPaths: areaPaths ?? ["Fabrikam\\Payments", "Fabrikam\\Reporting"],
    assigneeSuggestions: () => [],
    onCreate,
    onCancel,
  });
  document.body.append(form);
  await vi.waitFor(() => expect(trigger(form, "iteration").disabled).toBe(false));
  return { form, onCreate, onCancel };
}

const field = <T extends HTMLElement>(form: HTMLElement, name: string): T =>
  form.querySelector<T>(`.awesomeado-new-work-item__${name}`)!;

/** The collapsed button of a themed select field. */
const trigger = (form: HTMLElement, name: string): HTMLButtonElement =>
  field<HTMLButtonElement>(form, `${name}__trigger`);

/** What the field currently shows; the value behind it is the button's full-path tooltip. */
const shown = (form: HTMLElement, name: string): string =>
  field<HTMLElement>(form, `${name}__value`).textContent ?? "";

/** Open a select field and read the values it offers, in order. */
const offered = (form: HTMLElement, name: string): string[] =>
  options(form, name).map((o) => o.value);

/** The option rows of an OPEN select field. */
const options = (form: HTMLElement, name: string): HTMLButtonElement[] => [
  ...form.querySelectorAll<HTMLButtonElement>(`.awesomeado-new-work-item__${name}__option`),
];

/** Pick `value` from a select field, opening it first. */
const pick = (form: HTMLElement, name: string, value: string): void => {
  trigger(form, name).click();
  options(form, name)
    .find((option) => option.value === value)!
    .click();
};

const create = (form: HTMLElement): HTMLButtonElement => field<HTMLButtonElement>(form, "create");

const interruptPill = (form: HTMLElement): HTMLButtonElement =>
  field<HTMLButtonElement>(form, "interrupt");

const tickInterrupt = (form: HTMLElement): void => interruptPill(form).click();

const tickAccepted = (form: HTMLElement): void => field<HTMLInputElement>(form, "accepted").click();

/** Type into one of the form's Markdown boxes the way an author does. */
const type = (form: HTMLElement, name: string, text: string): void => {
  const box = field<HTMLTextAreaElement>(form, name);
  box.value = text;
  box.dispatchEvent(new Event("input"));
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("renderNewWorkItemPanel - what the form opens on", () => {
  it("inherits the parent's area path and starts on the team's current sprint", async () => {
    const { form } = await mount();

    expect(trigger(form, "area").title).toBe("Fabrikam\\Payments");
    expect(shown(form, "iteration")).toBe("Current - Sprint 5");
  });

  it("offers the catalog's other area paths beside the inherited one", async () => {
    const { form } = await mount();
    trigger(form, "area").click();

    expect(offered(form, "area")).toEqual(["Fabrikam\\Payments", "Fabrikam\\Reporting"]);
  });

  it("offers only the areas nothing else is filed beneath", async () => {
    const { form } = await mount(undefined, [
      "Fabrikam\\Payments",
      "Fabrikam\\Reporting",
      "Fabrikam\\Reporting\\Ledger",
    ]);
    trigger(form, "area").click();

    expect(offered(form, "area")).toEqual(["Fabrikam\\Payments", "Fabrikam\\Reporting\\Ledger"]);
  });

  it("names colliding leaves by enough of their path to tell them apart", async () => {
    const { form } = await mount(undefined, [
      "Fabrikam\\Payments\\API",
      "Fabrikam\\Reporting\\API",
    ]);
    trigger(form, "area").click();

    const labels = options(form, "area").map((option) => option.textContent);
    expect(labels).toContain("Payments \u203A API");
    expect(labels).toContain("Reporting \u203A API");
  });

  it("assigns the work to whoever is signed in", async () => {
    const { form } = await mount();

    await vi.waitFor(() => expect(form.textContent).toContain("Ada Lovelace"));
  });

  it("keeps the parent's iteration when the team has no sprints configured", async () => {
    const form = renderNewWorkItemPanel({
      doc: document,
      parent: PARENT,
      typeName: "Story",
      services: services({ loadSprintWindow: async () => ({ entries: [], currentName: null }) }),
      areaPaths: [],
      assigneeSuggestions: () => [],
      onCreate: async () => true,
      onCancel: () => undefined,
    });
    document.body.append(form);

    await vi.waitFor(() => expect(trigger(form, "iteration").disabled).toBe(false));
    expect(shown(form, "iteration")).toBe("Fabrikam\\Backlog");
  });
});

describe("renderNewWorkItemPanel - creating", () => {
  it("refuses to create anything until a title is typed", async () => {
    const { form } = await mount();
    expect(create(form).disabled).toBe(true);

    const title = field<HTMLInputElement>(form, "title");
    title.value = "Retry on decline";
    title.dispatchEvent(new Event("input"));

    expect(create(form).disabled).toBe(false);
  });

  it("hands over everything the reader decided", async () => {
    const { form, onCreate } = await mount();
    const title = field<HTMLInputElement>(form, "title");
    title.value = "  Retry on decline  ";
    title.dispatchEvent(new Event("input"));
    type(form, "description", "Declines are not retried.");
    pick(form, "iteration", "Fabrikam\\Sprint 6");
    pick(form, "area", "Fabrikam\\Reporting");

    create(form).click();

    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledWith({
      title: "Retry on decline",
      description: "Declines are not retried.",
      assignedTo: "ada@example.com",
      areaPath: "Fabrikam\\Reporting",
      iterationPath: "Fabrikam\\Sprint 6",
      tags: [],
      comment: null,
    });
  });

  it("says so in place when Azure DevOps refused, keeping what was typed", async () => {
    const { form, onCreate } = await mount();
    onCreate.mockResolvedValue(false);
    const title = field<HTMLInputElement>(form, "title");
    title.value = "Retry on decline";
    title.dispatchEvent(new Event("input"));

    create(form).click();

    await vi.waitFor(() =>
      expect(field(form, "error").textContent).toBe("Not created — see the diagnostics log."),
    );
    expect(title.value).toBe("Retry on decline");
    expect(create(form).disabled).toBe(false);
  });

  it("abandons the form on Cancel without creating anything", async () => {
    const { form, onCreate, onCancel } = await mount();

    field<HTMLButtonElement>(form, "cancel").click();

    expect(onCancel).toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });
});

describe("renderNewWorkItemPanel - the interrupt flag", () => {
  it("asks nothing more when the work is simply flagged as an interrupt", async () => {
    const { form, onCreate } = await mount();
    const title = field<HTMLInputElement>(form, "title");
    title.value = "Retry on decline";
    title.dispatchEvent(new Event("input"));

    tickInterrupt(form);
    create(form).click();

    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({ tags: ["Interrupt"], comment: null });
  });

  it("draws the pill drained of colour until the work is flagged", async () => {
    const { form } = await mount();
    const pill = () => interruptPill(form).querySelector<HTMLElement>(".awesomeado-marker-pill")!;
    expect(pill().style.filter).toBe("grayscale(1)");
    expect(interruptPill(form).getAttribute("aria-pressed")).toBe("false");

    tickInterrupt(form);

    expect(pill().style.filter).toBe("");
    expect(interruptPill(form).getAttribute("aria-pressed")).toBe("true");
  });

  it("paints the pill as accepted once the acceptance is ticked", async () => {
    const { form } = await mount();
    tickInterrupt(form);
    const pill = () => interruptPill(form).querySelector<HTMLElement>(".awesomeado-marker-pill")!;
    expect(pill().dataset.accepted).toBe("false");

    tickAccepted(form);

    expect(pill().dataset.accepted).toBe("true");
  });

  it("offers the acceptance question only once the interrupt flag is on", async () => {
    const { form } = await mount();
    expect(field(form, "accepted-row").style.display).toBe("none");

    tickInterrupt(form);

    expect(field(form, "accepted-row").style.display).toBe("flex");
  });

  it("makes the reason mandatory once the interrupt is accepted", async () => {
    const { form } = await mount();
    const title = field<HTMLInputElement>(form, "title");
    title.value = "Retry on decline";
    title.dispatchEvent(new Event("input"));
    expect(create(form).disabled).toBe(false);

    tickInterrupt(form);
    tickAccepted(form);

    expect(create(form).disabled).toBe(true);
  });

  it("records the reason under the team's own acceptance marker", async () => {
    const { form, onCreate } = await mount();
    const title = field<HTMLInputElement>(form, "title");
    title.value = "Retry on decline";
    title.dispatchEvent(new Event("input"));
    tickInterrupt(form);
    tickAccepted(form);
    type(form, "reason", "Customer escalation.");

    expect(create(form).disabled).toBe(false);
    create(form).click();

    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({
      tags: ["Interrupt"],
      comment: "[ACCEPTED] Customer escalation.",
    });
  });

  it("says why the flag is inert when the team configured no interrupt tag", async () => {
    const { form } = await mount({
      markerTags: () => ({
        blocked: { tag: "Blocked", commentTag: "[BLOCKED]" },
        blockedByOtherTeam: { tag: "", commentTag: "" },
        interrupt: { tag: "", commentTag: "" },
      }),
    });

    expect(interruptPill(form).disabled).toBe(true);
    expect(interruptPill(form).title).toContain("No Azure DevOps tag is configured");
    expect(field<HTMLInputElement>(form, "accepted").disabled).toBe(true);
  });
});
