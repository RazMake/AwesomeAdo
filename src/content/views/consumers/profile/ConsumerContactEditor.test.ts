import { describe, expect, it, vi } from "vitest";

import type { DirectoryUser, IUserDirectory } from "../../../../common/ado/IUserDirectory";
import type { WorkItemFieldWriteResult } from "../../../../common/ado/IWorkItemFieldWriter";
import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import {
  WorkItemWriteQueue,
  type WriteField,
} from "../../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";

import { aliasOfUniqueName, createConsumerContactEditor } from "./ConsumerContactEditor";

const JANE: DirectoryUser = {
  displayName: "Jane Doe",
  uniqueName: "jdoe@contoso.com",
  imageUrl: null,
};
const BOB: DirectoryUser = { displayName: "Bob Ray", uniqueName: "CONTOSO\\bray", imageUrl: null };

const LISTED = "# Contacts\n- `M1`: Ann Lee (_alee_)\n";

function consumer(description: string): TrackedWorkItem {
  return {
    id: 10,
    rev: 3,
    type: "Consumer",
    title: "Contoso",
    state: "Active",
    priority: null,
    assignedTo: null,
    areaPath: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "2026-07-01T00:00:00Z",
    createdBy: null,
    changedDate: "2026-07-01T00:00:00Z",
    changedBy: null,
    stateChangeDate: "2026-07-01T00:00:00Z",
    description,
    noteCount: 0,
    tags: [],
    importance: 1,
    eta: null,
    children: [],
  };
}

/** An editor over a real write queue whose writes answer with `answer`, plus what it touched. */
function harness(
  answer: () => Promise<WorkItemFieldWriteResult> = async () => ({ ok: true, rev: 4 }),
  userDirectory: IUserDirectory = { search: async () => [], resolve: async () => null },
  mentionNames?: () => ReadonlyMap<string, string>,
) {
  const logger = { info: vi.fn(), error: vi.fn() };
  const writeField = vi.fn<WriteField>(answer);
  const onSettled = vi.fn();
  const editor = createConsumerContactEditor({
    queue: new WorkItemWriteQueue(writeField, logger),
    userDirectory,
    logger,
    onSettled,
    ...(mentionNames === undefined ? {} : { mentionNames }),
  });
  const logged = (): string[] =>
    logger.info.mock.calls
      .map(([line]) => line as string)
      .filter((line) => line.startsWith("Consumer "));
  return { editor, writeField, onSettled, logger, logged };
}

/** Let the editor's turn and the queued write settle, without any timer. */
async function flush(): Promise<void> {
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
}

describe("aliasOfUniqueName", () => {
  it("reads the alias out of an email address or a domain account", () => {
    expect(aliasOfUniqueName("jdoe@contoso.com")).toBe("jdoe");
    expect(aliasOfUniqueName("CONTOSO\\bray")).toBe("bray");
    expect(aliasOfUniqueName(null)).toBeNull();
    expect(aliasOfUniqueName("  ")).toBeNull();
  });
});

describe("createConsumerContactEditor - add", () => {
  it("writes the new contact into the description as one guarded Markdown patch", async () => {
    const { editor, writeField, onSettled, logged } = harness();
    const target = consumer(LISTED);

    editor.add(target, JANE);
    await flush();

    const written = `${LISTED.trimEnd()}\n- Jane Doe (_jdoe_)\n`;
    expect(writeField).toHaveBeenCalledTimes(1);
    expect(writeField).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 10,
        rev: 3,
        field: "System.Description",
        value: written,
        baseValue: LISTED,
        multilineFormat: "Markdown",
      }),
    );
    expect(target.description).toBe(written);
    expect(target.rev).toBe(4);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(logged()).toEqual(["Consumer 10 contacts: add saved."]);
  });

  it("asks the directory for the address of a person picked without one", async () => {
    const resolve = vi.fn(async () => BOB);
    const { editor, writeField } = harness(undefined, { search: async () => [], resolve });

    editor.add(consumer(LISTED), { ...BOB, uniqueName: null });
    await flush();

    expect(resolve).toHaveBeenCalledWith("Bob Ray");
    expect(writeField.mock.calls[0]?.[0]?.value).toContain("- Bob Ray (_bray_)");
  });

  it("writes each of two quick adds over the description the first one left", async () => {
    const revs = [4, 5];
    const { editor, writeField } = harness(async () => ({ ok: true, rev: revs.shift() }));
    const target = consumer(LISTED);

    editor.add(target, JANE);
    editor.add(target, BOB);
    await flush();

    const [first, second] = writeField.mock.calls.map(([request]) => request);
    expect(second?.baseValue).toBe(first?.value);
    expect(second?.rev).toBe(4);
    expect(target.description).toContain("- Jane Doe (_jdoe_)\n- Bob Ray (_bray_)");
    expect(target.rev).toBe(5);
  });
});

describe("createConsumerContactEditor - add, not written", () => {
  it("does not list the same person twice", async () => {
    const { editor, writeField, onSettled, logged } = harness();

    editor.add(consumer(LISTED), {
      ...JANE,
      displayName: "Ann Lee",
      uniqueName: "ALEE@contoso.com",
    });
    await flush();

    expect(writeField).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(logged()).toEqual([
      "Consumer 10 contacts: add not written — that person is already a contact.",
    ]);
  });

  it("leaves a rich-text description alone", async () => {
    const { editor, writeField, logged } = harness();

    editor.add(consumer("<ul><li>Ann Lee</li></ul>"), JANE);
    await flush();

    expect(writeField).not.toHaveBeenCalled();
    expect(logged()).toEqual([
      "Consumer 10 contacts: add not written — the description is rich text; it has to be " +
        "Markdown to be editable.",
    ]);
  });

  it("recognizes a person already listed by mention", async () => {
    const guid = "11111111-2222-3333-4444-555555555555";
    const { editor, writeField, logged } = harness(
      undefined,
      undefined,
      () => new Map([[guid, "Jane Doe"]]),
    );

    editor.add(consumer(`# Contacts\n- @<${guid}>`), { ...JANE, uniqueName: null });
    await flush();

    expect(writeField).not.toHaveBeenCalled();
    expect(logged()).toEqual([
      "Consumer 10 contacts: add not written — that person is already a contact.",
    ]);
  });
});

describe("createConsumerContactEditor - remove", () => {
  it("deletes that contact's line as one guarded Markdown patch", async () => {
    const { editor, writeField, logged } = harness();
    const target = consumer("# Contacts\n- `M1`: Ann Lee (_alee_)\n- Bob Ray\n");

    editor.remove(target, 0);
    await flush();

    expect(writeField).toHaveBeenCalledWith(
      expect.objectContaining({
        field: "System.Description",
        value: "# Contacts\n- Bob Ray\n",
        baseValue: "# Contacts\n- `M1`: Ann Lee (_alee_)\n- Bob Ray\n",
        multilineFormat: "Markdown",
      }),
    );
    expect(target.description).toBe("# Contacts\n- Bob Ray\n");
    expect(logged()).toEqual(["Consumer 10 contacts: remove #1 saved."]);
  });

  it.each([
    ["the description is rich text; it has to be Markdown to be editable", "<ul><li>Ann</li></ul>"],
    ["that contact shares its line with other people", "## Contacts\n- Ann Lee; Bob Ray"],
    [
      "that contact is written in a table",
      "## Contacts\n| Role | Name |\n|---|---|\n| M1 | Ann Lee |",
    ],
    [
      "that contact is written on a labelled line outside the Contacts section",
      "Owner: Ann Lee (alee)",
    ],
  ])("leaves the description alone when %s", async (reason, description) => {
    const { editor, writeField, onSettled, logged } = harness();

    editor.remove(consumer(description), 0);
    await flush();

    expect(writeField).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(logged()).toEqual([`Consumer 10 contacts: remove #1 not written — ${reason}.`]);
  });

  it("keeps a mention a mention when only its role changes", async () => {
    const guid = "11111111-2222-3333-4444-555555555555";
    const { editor, writeField } = harness();

    editor.setRole(consumer(`# Contacts\n- @<${guid}>`), 0, "PM");
    await flush();

    expect(writeField.mock.calls[0]?.[0]?.value).toBe(`# Contacts\n- \`PM\`: @<${guid}>`);
  });
});

describe("createConsumerContactEditor - change", () => {
  it("gives a contact a role", async () => {
    const { editor, writeField } = harness();

    editor.setRole(consumer("# Contacts\n- Ann Lee (_alee_)"), 0, "Owner");
    await flush();

    expect(writeField.mock.calls[0]?.[0]?.value).toBe("# Contacts\n- `Owner`: Ann Lee (_alee_)");
  });

  it("puts someone else in a contact's place, keeping the role they held", async () => {
    const { editor, writeField } = harness();

    editor.replace(consumer(LISTED), 0, JANE);
    await flush();

    expect(writeField.mock.calls[0]?.[0]?.value).toBe("# Contacts\n- `M1`: Jane Doe (_jdoe_)\n");
  });

  it("writes nothing for a role the contact already holds, or a contact no longer listed", async () => {
    const { editor, writeField, logged } = harness();
    const target = consumer(LISTED);

    editor.setRole(target, 0, "M1");
    editor.setRole(target, 3, "Owner");
    await flush();

    expect(writeField).not.toHaveBeenCalled();
    expect(logged()).toEqual([
      "Consumer 10 contacts: role of #1 not written — nothing changed.",
      "Consumer 10 contacts: role of #4 not written — that contact is no longer listed.",
    ]);
  });

  it("keeps the description it had when Azure DevOps refuses the write, and still repaints", async () => {
    const { editor, onSettled } = harness(async () => ({ ok: false, error: "conflict" }));
    const target = consumer(LISTED);

    editor.setRole(target, 0, "Owner");
    await flush();

    expect(target.description).toBe(LISTED);
    expect(target.rev).toBe(3);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("logs a failure to look the person up, and still repaints", async () => {
    const failure = new Error("directory down");
    const { editor, writeField, onSettled, logger } = harness(undefined, {
      search: async () => [],
      resolve: async () => Promise.reject(failure),
    });

    editor.replace(consumer(LISTED), 0, { ...JANE, uniqueName: null });
    await flush();

    expect(writeField).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith("Consumer 10 contacts: replace #1 failed.", failure);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
