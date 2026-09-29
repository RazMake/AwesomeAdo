// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import { FAVORITES_REFUSALS } from "../../common/browser/Favorites";

import { FavoritesPathEditor } from "./FavoritesPathEditor";

const ACCESS_REQUIRED =
  "Allow Favorites access to choose a folder. Until then, Sync projects to Favorites stays disabled for this catalog.";
const ACCESS_DENIED =
  "Favorites access wasn't allowed. Allow it to choose a folder; until then, Sync projects to Favorites stays disabled for this catalog.";
const ACCESS_FAILED =
  "Could not ask for Favorites access. Use Allow Favorites access to try again.";
const DISABLED_DECISION =
  "Favorites path for query catalog-query: disabled until Favorites access is allowed.";

let editor: FavoritesPathEditor | undefined;

async function settle(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

interface SetupOptions {
  granted?: boolean;
  initialPath?: string;
  /** How the browser prompt answers; a grant is remembered like Chromium's permission store. */
  request?: () => Promise<boolean>;
  isGranted?: Mock<() => Promise<boolean>>;
}

async function setup({
  granted = false,
  initialPath = "Work",
  request = async () => false,
  isGranted,
}: SetupOptions = {}) {
  let allowed = granted;
  const access = {
    isGranted: isGranted ?? vi.fn(async () => allowed),
    request: vi.fn((): Promise<boolean> =>
      request().then((answer) => {
        if (answer) allowed = true;
        return answer;
      }),
    ),
  };
  const paths = { read: vi.fn(async () => initialPath), write: vi.fn(async () => {}) };
  const options = {
    paths,
    access,
    folderPaths: vi.fn(async () => ["Work", "Work/Projects"]),
    recordError: vi.fn(),
    recordDecision: vi.fn(),
  };
  editor = new FavoritesPathEditor(document, "catalog-query", options);
  document.body.append(editor.root);
  await settle();
  const input = editor.root.querySelector<HTMLInputElement>("input")!;
  return { paths, options, input };
}

function accessRow(): HTMLElement {
  return editor!.root.querySelector<HTMLElement>(".favorites-path-access")!;
}

function accessButton(): HTMLButtonElement {
  return accessRow().querySelector<HTMLButtonElement>("button")!;
}

function commit(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("change"));
}

/** A browser permission prompt the test answers explicitly. */
function openPrompt(): { answer: Promise<boolean>; respond(granted: boolean): void } {
  let respond: (granted: boolean) => void = () => {};
  const answer = new Promise<boolean>((resolve) => {
    respond = resolve;
  });
  return { answer, respond };
}

afterEach(() => {
  editor?.dispose();
  editor = undefined;
  document.body.replaceChildren();
});

describe("personal Favorites path editor with access", () => {
  it("always shows the replacement warning and empty-path hint", async () => {
    await setup({ granted: true });

    expect(editor?.root.textContent).toContain(
      "Sync projects to Favorites replaces the favorites in this folder with this catalog's project queries.",
    );
    expect(editor?.root.textContent).toContain("Leave empty to keep syncing off for this catalog.");
  });

  it("unlocks the field with suggestions when access is already allowed", async () => {
    const { options, input } = await setup({ granted: true });

    expect(input.disabled).toBe(false);
    expect(input.value).toBe("Work");
    expect(accessRow().hidden).toBe(true);
    expect(options.folderPaths).toHaveBeenCalledTimes(1);
    expect(options.access.request).not.toHaveBeenCalled();
    expect(options.recordDecision).not.toHaveBeenCalled();
  });

  it("saves a normalized valid path without asking for access", async () => {
    const { paths, options, input } = await setup({ granted: true });
    commit(input, " Work\\Projects ");
    await settle();

    expect(paths.write).toHaveBeenCalledWith("catalog-query", "Work/Projects");
    expect(input.value).toBe("Work/Projects");
    expect(options.access.request).not.toHaveBeenCalled();
  });

  it("clears an empty path", async () => {
    const { paths, input } = await setup({ granted: true });
    commit(input, "   ");
    await settle();

    expect(paths.write).toHaveBeenCalledWith("catalog-query", "");
  });

  it("refreshes suggestions each time the field is focused", async () => {
    const { options, input } = await setup({ granted: true });
    input.focus();
    await settle();

    expect(options.folderPaths).toHaveBeenCalledTimes(2);
  });
});

describe("personal Favorites path validation", () => {
  it("validates root input without saving", async () => {
    const { paths, input } = await setup({ granted: true });
    input.value = "/";
    input.dispatchEvent(new Event("input"));

    expect(editor?.root.querySelector('[role="alert"]')?.textContent).toBe(
      FAVORITES_REFUSALS.invalidPath,
    );
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(paths.write).not.toHaveBeenCalled();
  });

  it.each(["/", "Work//X", "."])("does not save invalid change %s", async (value) => {
    const { paths, input } = await setup({ granted: true });
    commit(input, value);
    await settle();

    expect(paths.write).not.toHaveBeenCalled();
  });

  it("does not save a value when disposed before it is committed", async () => {
    const { paths, input } = await setup({ granted: true });
    input.value = "Work/Projects";
    input.dispatchEvent(new Event("input"));
    editor?.dispose();
    editor = undefined;

    expect(paths.write).not.toHaveBeenCalled();
  });

  it("does not save after an invalid change when disposed", async () => {
    const { paths, input } = await setup({ granted: true });
    commit(input, "/");
    editor?.dispose();
    editor = undefined;
    await settle();

    expect(paths.write).not.toHaveBeenCalled();
  });
});

describe("personal Favorites path editor without access", () => {
  it("keeps the field disabled and offers the access button even without a saved folder", async () => {
    const { options, input } = await setup({ initialPath: "" });

    expect(input.disabled).toBe(true);
    expect(accessRow().hidden).toBe(false);
    expect(accessRow().textContent).toContain(ACCESS_REQUIRED);
    expect(accessButton().textContent).toBe("Allow Favorites access");
    expect(accessButton().hidden).toBe(false);
    expect(accessButton().disabled).toBe(false);
    expect(options.folderPaths).not.toHaveBeenCalled();
  });

  it("shows a saved folder read-only until access is allowed", async () => {
    const { input } = await setup({ initialPath: "Work/Projects" });

    expect(input.value).toBe("Work/Projects");
    expect(input.disabled).toBe(true);
  });

  it("records once why the field is disabled, without the folder path", async () => {
    const { options } = await setup({ initialPath: "Private/Projects" });

    expect(options.recordDecision).toHaveBeenCalledTimes(1);
    expect(options.recordDecision).toHaveBeenCalledWith(DISABLED_DECISION);
  });

  it("treats a failed access check as missing access", async () => {
    const failure = new Error("Permissions are unavailable");
    const { options, input } = await setup({
      isGranted: vi.fn<() => Promise<boolean>>().mockRejectedValue(failure),
    });

    expect(options.recordError).toHaveBeenCalledWith(failure);
    expect(input.disabled).toBe(true);
    expect(accessRow().hidden).toBe(false);
  });

  it("locks the field again when a focus re-check finds access removed", async () => {
    const { options, input } = await setup({ granted: true });
    options.access.isGranted.mockResolvedValue(false);
    input.focus();
    await settle();

    expect(input.disabled).toBe(true);
    expect(accessRow().hidden).toBe(false);
    expect(options.recordDecision).toHaveBeenCalledWith(DISABLED_DECISION);
  });
});

describe("personal Favorites path editor access requests", () => {
  it("asks synchronously from the button, then unlocks the field with suggestions", async () => {
    const request = vi.fn(async () => true);
    const { options, input } = await setup({ request });
    accessButton().click();

    expect(request).toHaveBeenCalledTimes(1);
    await settle();

    expect(options.recordDecision).toHaveBeenCalledWith(
      "Favorites access for query catalog-query from Allow Favorites access: allowed.",
    );
    expect(options.folderPaths).toHaveBeenCalled();
    expect(input.disabled).toBe(false);
    expect(accessRow().hidden).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("loads suggestions before handing focus to the unlocked field", async () => {
    const { options, input } = await setup({ request: vi.fn(async () => true) });
    const loadsWhenFocused: number[] = [];
    input.addEventListener("focus", () => {
      loadsWhenFocused.push(options.folderPaths.mock.calls.length);
    });
    accessButton().click();
    await settle();

    expect(loadsWhenFocused).toEqual([1]);
  });

  it("ignores a prompt answered after the editor is disposed", async () => {
    const prompt = openPrompt();
    const { options, input } = await setup({ request: vi.fn(() => prompt.answer) });
    accessButton().click();
    editor?.dispose();
    editor = undefined;
    prompt.respond(true);
    await settle();

    expect(options.folderPaths).not.toHaveBeenCalled();
    expect(input.disabled).toBe(true);
    expect(document.activeElement).not.toBe(input);
  });
});

describe("personal Favorites path editor access request failures", () => {
  it("disables the button while the prompt is open and stays locked when denied", async () => {
    const prompt = openPrompt();
    const request = vi.fn(() => prompt.answer);
    const { options, input } = await setup({ request });
    accessButton().click();
    accessButton().click();

    expect(request).toHaveBeenCalledTimes(1);
    expect(accessButton().disabled).toBe(true);
    prompt.respond(false);
    await settle();

    expect(options.recordDecision).toHaveBeenCalledWith(
      "Favorites access for query catalog-query from Allow Favorites access: not allowed.",
    );
    expect(input.disabled).toBe(true);
    expect(accessRow().textContent).toContain(ACCESS_DENIED);
    expect(accessButton().disabled).toBe(false);
    expect(options.folderPaths).not.toHaveBeenCalled();
  });

  it("reports a rejected request and unlocks after a successful retry", async () => {
    const rejection = new Error("Permission request failed");
    const request = vi.fn().mockRejectedValueOnce(rejection).mockResolvedValueOnce(true);
    const { options, input } = await setup({ request });
    accessButton().click();
    await settle();

    expect(options.recordError).toHaveBeenCalledWith(rejection);
    expect(accessRow().textContent).toContain(ACCESS_FAILED);
    expect(input.disabled).toBe(true);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    accessButton().click();
    await settle();

    expect(input.disabled).toBe(false);
    expect(accessRow().hidden).toBe(true);
  });

  it("reports a request that throws before the browser can prompt", async () => {
    const failure = new Error("This function must be called during a user gesture");
    const { options } = await setup({
      request: vi.fn((): Promise<boolean> => {
        throw failure;
      }),
    });
    accessButton().click();

    expect(options.recordError).toHaveBeenCalledWith(failure);
    expect(accessRow().textContent).toContain(ACCESS_FAILED);
    expect(accessButton().disabled).toBe(false);
  });

  it("does not repeat the disabled decision while access stays missing", async () => {
    const { options } = await setup({ request: vi.fn(async () => false) });
    accessButton().click();
    await settle();
    accessButton().click();
    await settle();

    const disabledDecisions = options.recordDecision.mock.calls.filter(
      ([message]) => message === DISABLED_DECISION,
    );
    expect(disabledDecisions).toHaveLength(1);
  });
});

describe("personal Favorites path editor failures", () => {
  it("reports a path write failure and permits a later correction", async () => {
    const { paths, options, input } = await setup({ granted: true });
    paths.write.mockRejectedValueOnce(new Error("Invalid path"));
    commit(input, "Work/Projects");
    await settle();

    expect(options.recordError).toHaveBeenCalled();
    expect(editor?.root.textContent).toContain("Invalid path");
    commit(input, "Fixed");
    await settle();

    expect(paths.write).toHaveBeenLastCalledWith("catalog-query", "Fixed");
  });
});
