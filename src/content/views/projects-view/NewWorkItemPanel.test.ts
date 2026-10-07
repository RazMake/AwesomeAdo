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
    attachmentUploader: {
      upload: async () => ({ ok: false, error: "not in tests" }),
      discard: async () => true,
    },
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

  it("keeps Create disabled while a create is in flight, whatever is typed meanwhile", async () => {
    const { form, onCreate } = await mount();
    let finish!: (created: boolean) => void;
    onCreate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const title = field<HTMLInputElement>(form, "title");
    title.value = "Retry on decline";
    title.dispatchEvent(new Event("input"));

    create(form).click();
    type(form, "description", "Still typing.");
    title.dispatchEvent(new Event("input"));
    expect(create(form).disabled).toBe(true);

    finish(false);
    await vi.waitFor(() => expect(create(form).disabled).toBe(false));
    expect(onCreate).toHaveBeenCalledTimes(1);
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

/** An uploader whose single upload the test settles by hand, so the in-flight state is visible. */
function heldUploader() {
  let settle!: (url: string) => void;
  const upload = vi.fn(
    () =>
      new Promise<{ ok: boolean; url: string; id: string }>((resolve) => {
        settle = (url) => resolve({ ok: true, url, id: ATTACHMENT_ID });
      }),
  );
  const discard = vi.fn(async () => true);
  return { attachmentUploader: { upload, discard }, discard, settle: (url: string) => settle(url) };
}

const ATTACHMENT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

/** Paste one screenshot into the form's `name` box; jsdom has no real clipboard. */
function pasteImage(form: HTMLElement, name: string): void {
  const image = new File([new Uint8Array([1])], "image.png", { type: "image/png" });
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: () => "",
      items: [{ kind: "file", type: image.type, getAsFile: () => image }],
    },
  });
  field<HTMLTextAreaElement>(form, name).dispatchEvent(event);
}

describe("renderNewWorkItemPanel - pasting an image", () => {
  const URL_ = "https://dev.azure.com/org/_apis/wit/attachments/a1";

  it("holds Create until a pasted description image is stored, then creates it embedded", async () => {
    const held = heldUploader();
    const { form, onCreate } = await mount({ attachmentUploader: held.attachmentUploader });
    const title = field<HTMLInputElement>(form, "title");
    title.value = "Retry on decline";
    title.dispatchEvent(new Event("input"));

    pasteImage(form, "description");
    expect(create(form).disabled).toBe(true);

    held.settle(URL_);
    await vi.waitFor(() => expect(create(form).disabled).toBe(false));
    create(form).click();

    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0]?.[0].description).toBe(`![image.png](${URL_})`);
  });

  it("holds Create while an accepted interrupt's reason is still uploading an image", async () => {
    const held = heldUploader();
    const { form, onCreate } = await mount({ attachmentUploader: held.attachmentUploader });
    const title = field<HTMLInputElement>(form, "title");
    title.value = "Retry on decline";
    title.dispatchEvent(new Event("input"));
    tickInterrupt(form);
    tickAccepted(form);

    pasteImage(form, "reason");
    expect(create(form).disabled).toBe(true);

    held.settle(URL_);
    await vi.waitFor(() => expect(create(form).disabled).toBe(false));
    create(form).click();

    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0]?.[0].comment).toBe(`[ACCEPTED] ![image.png](${URL_})`);
  });
});

describe("renderNewWorkItemPanel - cleaning up pasted images", () => {
  const URL_ = "https://dev.azure.com/org/_apis/wit/attachments/a1";

  /** A form whose description already embeds one stored image. */
  async function formWithDescriptionImage() {
    const held = heldUploader();
    const mounted = await mount({ attachmentUploader: held.attachmentUploader });
    pasteImage(mounted.form, "description");
    held.settle(URL_);
    await vi.waitFor(() =>
      expect(field<HTMLTextAreaElement>(mounted.form, "description").value).toContain(URL_),
    );
    return { ...mounted, held };
  }

  it("removes a pasted description image when the form is cancelled", async () => {
    const { form, onCancel, held } = await formWithDescriptionImage();

    field<HTMLButtonElement>(form, "cancel").click();

    expect(held.discard).toHaveBeenCalledExactlyOnceWith(ATTACHMENT_ID);
    expect(onCancel).toHaveBeenCalled();
  });

  it("keeps a pasted description image once the item is created", async () => {
    const { form, onCreate, held } = await formWithDescriptionImage();
    onCreate.mockImplementation(async () => {
      form.remove();
      return true;
    });
    type(form, "title", "Retry on decline");

    create(form).click();
    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled());
    await Promise.resolve();

    expect(held.discard).not.toHaveBeenCalled();
  });

  it("removes a reason image left behind an unaccepted interrupt when the item is created", async () => {
    const held = heldUploader();
    const { form, onCreate } = await mount({ attachmentUploader: held.attachmentUploader });
    onCreate.mockImplementation(async () => {
      form.remove();
      return true;
    });
    tickInterrupt(form);
    tickAccepted(form);
    pasteImage(form, "reason");
    held.settle(URL_);
    await vi.waitFor(() =>
      expect(field<HTMLTextAreaElement>(form, "reason").value).toContain(URL_),
    );
    tickAccepted(form);
    type(form, "title", "Retry on decline");

    create(form).click();

    await vi.waitFor(() => expect(held.discard).toHaveBeenCalledWith(ATTACHMENT_ID));
    expect(onCreate.mock.calls[0]?.[0].comment).toBeNull();
  });
});
