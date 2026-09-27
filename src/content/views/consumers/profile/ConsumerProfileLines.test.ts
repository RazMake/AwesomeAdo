import { afterEach, describe, expect, it, vi } from "vitest";

import type { DirectoryUser, IUserDirectory } from "../../../../common/ado/IUserDirectory";

import {
  RICH_TEXT_CONTACTS_REASON,
  SHARED_CONTACT_REASONS,
  renderConsumerProfileLines,
  type ContactEditing,
} from "./ConsumerProfileLines";
import type { ConsumerProfile, ConsumerProfileReading, ContactShape } from "./consumerProfile";

const JANE: DirectoryUser = {
  displayName: "Jane Doe",
  uniqueName: "jdoe@contoso.com",
  imageUrl: null,
};

const SUNDAR = { fullName: "Sundar Kameswaran", alias: "skamesw", role: "M1" };
const UNROLED = { fullName: "Jane Doe", alias: null, role: null };

/**
 * A reading of `overrides`; `editable` says whether its description has lines to rewrite, and
 * `shapes` how each contact was written (each on a line of its own unless given).
 */
function reading(
  overrides: Partial<ConsumerProfile>,
  editable = true,
  shapes: readonly ContactShape[] = [],
): ConsumerProfileReading {
  const contacts = overrides.contacts ?? [];
  return {
    profile: {
      serviceName: null,
      clientId: null,
      scenario: null,
      details: [],
      contacts: [],
      ...overrides,
    },
    layout: {
      sourceLines: editable ? [] : null,
      headingLine: null,
      entries: contacts.map((_, line) => ({ line, shape: shapes[line] ?? "own-line" })),
    },
  };
}

function directoryFinding(...people: DirectoryUser[]): IUserDirectory {
  return {
    search: () => Promise.resolve(people),
    resolve: () => Promise.resolve(null),
  };
}

function editing(overrides: Partial<ContactEditing> = {}): ContactEditing {
  return {
    userDirectory: directoryFinding(JANE),
    roles: ["M1", "Owner"],
    onAdd: vi.fn(),
    onReplace: vi.fn(),
    onRoleChange: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
}

function render(
  overrides: Partial<ConsumerProfile>,
  editable = true,
  hooks: ContactEditing = editing(),
  shapes: readonly ContactShape[] = [],
): HTMLElement {
  const block = renderConsumerProfileLines(document, reading(overrides, editable, shapes), hooks);
  document.body.append(block);
  return block;
}

function removeButtons(block: HTMLElement): HTMLButtonElement[] {
  return [...block.querySelectorAll<HTMLButtonElement>(".awesomeado-assigned__remove")];
}

function textOf(block: HTMLElement, className: string): string | null {
  return block.querySelector<HTMLElement>(`.${className}`)?.textContent ?? null;
}

function contactPills(block: HTMLElement): HTMLElement[] {
  return [
    ...block.querySelectorAll<HTMLElement>(".awesomeado-consumers__contact .awesomeado-assigned"),
  ];
}

/** Type into the open people picker and pick its first answer. */
async function pickFirstPerson(block: HTMLElement): Promise<void> {
  const search = block.querySelector<HTMLInputElement>(".awesomeado-assigned__search")!;
  search.value = "jane";
  search.dispatchEvent(new Event("input"));
  await Promise.resolve();
  await Promise.resolve();
  block.querySelector<HTMLButtonElement>(".awesomeado-assigned__result button")!.click();
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderConsumerProfileLines - identity", () => {
  it("shows the service name and its client id in parentheses", () => {
    const block = render({ serviceName: "IPSimulationService", clientId: "531aebea-d218" });

    expect(textOf(block, "awesomeado-consumers__service-name")).toBe("IPSimulationService");
    expect(textOf(block, "awesomeado-consumers__client-id")).toBe("531aebea-d218");
    expect(textOf(block, "awesomeado-consumers__identity")).toBe(
      "IPSimulationService(531aebea-d218)",
    );
  });

  it("leaves out the half of the identity line the description never gave", () => {
    const block = render({ clientId: "531aebea-d218" }, false);

    expect(block.querySelector(".awesomeado-consumers__service-name")).toBeNull();
    expect(textOf(block, "awesomeado-consumers__identity")).toBe("(531aebea-d218)");
  });

  it("is not a row surface of its own: the consumer's card is the one row", () => {
    const block = render({ serviceName: "Contoso" });

    expect(block.classList.contains("awesomeado-consumers__row")).toBe(false);
  });
});

describe("renderConsumerProfileLines - contact list", () => {
  it("lists one assignee pill per contact, named without the alias", () => {
    const block = render({ contacts: [SUNDAR, UNROLED] });

    expect(textOf(block, "awesomeado-consumers__contacts-label")).toBe("Contacts");
    const list = block.querySelector("ul.awesomeado-consumers__contact-list")!;
    expect(list.children).toHaveLength(2);
    expect(
      contactPills(block).map(
        (pill) => pill.querySelector(".awesomeado-assigned__name")?.textContent,
      ),
    ).toEqual(["Sundar Kameswaran", "Jane Doe"]);
    expect(block.textContent).not.toContain("skamesw");
  });

  it("keeps the alias in the pill's tooltip", () => {
    const [sundar, jane] = contactPills(render({ contacts: [SUNDAR, UNROLED] }));

    expect(sundar?.title).toBe("Alias: skamesw");
    expect(jane?.title).toBe("Jane Doe");
  });

  it("shows the role as the tag pill, and ?? for a contact with none yet", () => {
    const [sundar, jane] = contactPills(render({ contacts: [SUNDAR, UNROLED] }));

    expect(sundar?.querySelector(".awesomeado-tag-pill")?.textContent).toBe("M1");
    const untagged = jane?.querySelector(".awesomeado-tag-pill");
    expect(untagged?.textContent).toBe("??");
    expect(untagged?.classList.contains("awesomeado-tag-pill--untagged")).toBe(true);
  });

  it("keeps the contact's primary text colour and outline", () => {
    const [sundar] = contactPills(render({ contacts: [SUNDAR] }));

    expect(sundar?.style.getPropertyValue("--assigned-to-text-color")).toBe(
      "var(--text-primary-color)",
    );
    expect(sundar?.style.border).toBe("1px solid var(--control-border)");
  });

  it("shows the Contacts heading with no list for an editable description that names nobody", () => {
    const block = render({});

    expect(textOf(block, "awesomeado-consumers__contacts-label")).toBe("Contacts");
    expect(block.querySelector(".awesomeado-consumers__add-contact-button")).not.toBeNull();
    expect(block.querySelector(".awesomeado-consumers__contact-list")).toBeNull();
  });
});

describe("renderConsumerProfileLines - editing", () => {
  it("offers the board's roles and reports the one picked for that contact", () => {
    const hooks = editing();
    const block = render({ contacts: [UNROLED, SUNDAR] }, true, hooks);
    const pill = contactPills(block)[1]!.querySelector<HTMLElement>(".awesomeado-tag-pill")!;

    pill.click();
    const choices = [
      ...block.querySelectorAll<HTMLButtonElement>(
        ".awesomeado-assigned__tag-choices .awesomeado-tag-pill",
      ),
    ];
    expect(choices.map((choice) => choice.textContent)).toEqual(["M1", "Owner"]);
    choices.find((choice) => choice.textContent === "Owner")!.click();

    expect(hooks.onRoleChange).toHaveBeenCalledWith(1, "Owner");
  });

  it("replaces a contact with the person picked from their name", async () => {
    const hooks = editing();
    const block = render({ contacts: [SUNDAR] }, true, hooks);

    block.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")!.click();
    await pickFirstPerson(block);

    expect(hooks.onReplace).toHaveBeenCalledWith(0, JANE);
  });

  it("adds the person picked from the + button", async () => {
    const hooks = editing();
    const block = render({ contacts: [SUNDAR] }, true, hooks);
    const add = block.querySelector<HTMLButtonElement>(
      ".awesomeado-consumers__add-contact-button",
    )!;

    expect(add.title).toBe("Add a contact");
    add.click();
    await pickFirstPerson(block);

    expect(hooks.onAdd).toHaveBeenCalledWith(JANE);
  });
});

describe("renderConsumerProfileLines - rich-text description", () => {
  it("shows the contacts but offers no way to change them", () => {
    const hooks = editing();
    const block = render({ contacts: [SUNDAR] }, false, hooks);
    const [pill] = contactPills(block);
    const name = pill!.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")!;

    expect(name.disabled).toBe(true);
    expect(pill!.title).toBe(`Alias: skamesw\n${RICH_TEXT_CONTACTS_REASON}`);
    pill!.querySelector<HTMLElement>(".awesomeado-tag-pill")!.click();
    expect(block.querySelector(".awesomeado-assigned__tag-popup")).toBeNull();
  });

  it("keeps the + on screen, unavailable, with the reason as its tooltip", () => {
    const block = render({ contacts: [SUNDAR] }, false);
    const add = block.querySelector<HTMLButtonElement>(
      ".awesomeado-consumers__add-contact-button",
    )!;

    expect(add.getAttribute("aria-disabled")).toBe("true");
    expect(add.title).toBe(RICH_TEXT_CONTACTS_REASON);
    add.click();
    expect(block.querySelector(".awesomeado-assigned__popup")).toBeNull();
  });

  it("still shows the Contacts heading when the rich text names nobody", () => {
    const block = render({ serviceName: "Contoso" }, false);

    expect(textOf(block, "awesomeado-consumers__contacts-label")).toBe("Contacts");
    expect(block.querySelector(".awesomeado-consumers__contact-list")).toBeNull();
  });

  it("says over the whole Contacts section that the description has to be Markdown", () => {
    const section = render({ contacts: [SUNDAR] }, false).querySelector<HTMLElement>(
      ".awesomeado-consumers__contacts",
    )!;

    expect(RICH_TEXT_CONTACTS_REASON).toBe("The description has to be Markdown to be editable.");
    expect(section.title).toBe(RICH_TEXT_CONTACTS_REASON);
  });

  it("offers no way to remove a contact", () => {
    expect(removeButtons(render({ contacts: [SUNDAR, UNROLED] }, false))).toEqual([]);
  });
});

describe("renderConsumerProfileLines - removing a contact", () => {
  it("puts a remove button at the start of every editable contact, labelled with the person", () => {
    const block = render({ contacts: [SUNDAR, UNROLED] });
    const [sundar, jane] = contactPills(block);

    expect(sundar?.firstElementChild?.classList.contains("awesomeado-assigned__remove")).toBe(true);
    expect(removeButtons(block).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Remove Sundar Kameswaran from the contacts",
      "Remove Jane Doe from the contacts",
    ]);
    expect(jane?.querySelector(".awesomeado-assigned__remove")?.textContent).toBe("\u00d7");
  });

  it("reports which contact the remove button was clicked on", () => {
    const hooks = editing();
    const block = render({ contacts: [SUNDAR, UNROLED] }, true, hooks);

    removeButtons(block)[1]!.click();

    expect(hooks.onRemove).toHaveBeenCalledWith(1);
    expect(hooks.onReplace).not.toHaveBeenCalled();
  });

  it("leaves no title over an editable Contacts section", () => {
    const section = render({ contacts: [SUNDAR] }).querySelector<HTMLElement>(
      ".awesomeado-consumers__contacts",
    )!;

    expect(section.title).toBe("");
  });
});

describe("renderConsumerProfileLines - contacts written alongside other text", () => {
  it.each(["shared-line", "table-row", "inline"] as const)(
    "shows a %s contact read-only, saying why, while the others stay editable",
    (shape) => {
      const block = render({ contacts: [SUNDAR, UNROLED] }, true, editing(), ["own-line", shape]);
      const [sundar, jane] = contactPills(block);

      expect(jane?.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")?.disabled).toBe(
        true,
      );
      expect(jane?.title).toBe(`Jane Doe\n${SHARED_CONTACT_REASONS[shape]}`);
      expect(jane?.querySelector(".awesomeado-assigned__remove")).toBeNull();
      expect(sundar?.querySelector(".awesomeado-assigned__remove")).not.toBeNull();
      expect(
        block
          .querySelector(".awesomeado-consumers__add-contact-button")
          ?.getAttribute("aria-disabled"),
      ).toBeNull();
    },
  );
});
