import { beforeEach, describe, expect, it, vi } from "vitest";

import { AreaPathListEditor } from "./AreaPathListEditor";

const SUGGESTIONS = ["Project", "Project\\API", "Project\\Apps", "Project\\Platform"];
const DESCRIPTION =
  "Add the default area paths for the team one at a time. Each area path edit box offers autocomplete suggestions that match any part of the path. These defaults are used only when a sprint has no saved Lane selection.";

function editor(stored = "Project\\Apps\nProject\\Platform") {
  const onChange = vi.fn();
  const result = new AreaPathListEditor(document, stored, SUGGESTIONS, DESCRIPTION, onChange);
  document.body.append(result.root);
  return { result, onChange };
}

function addInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[aria-label="New default Lane area path"]')!;
}

beforeEach(() => document.body.replaceChildren());

describe("AreaPathListEditor", () => {
  it("renders one autocomplete edit row and remove button per stored path", () => {
    editor();

    const rows = document.querySelectorAll<HTMLInputElement>(".area-path-list-editor__row input");
    expect([...rows].map((input) => input.value)).toEqual(["Project\\Apps", "Project\\Platform"]);
    expect([...rows].every((input) => input.getAttribute("role") === "combobox")).toBe(true);
    expect(document.querySelectorAll(".area-path-list-editor__remove")).toHaveLength(2);
    const hint = document.querySelector(".area-path-list-editor__hint");
    expect(hint?.textContent).toBe(DESCRIPTION);
    expect(hint?.previousElementSibling?.classList.contains("area-path-list-editor__add")).toBe(
      true,
    );
  });

  it("disables Add while the textbox is blank", () => {
    editor("");
    const button = document.querySelector<HTMLButtonElement>(".area-path-list-editor__add button")!;
    expect(button.disabled).toBe(true);

    addInput().value = "  ";
    addInput().dispatchEvent(new Event("input"));
    expect(button.disabled).toBe(true);
    addInput().value = "Project\\API";
    addInput().dispatchEvent(new Event("input"));
    expect(button.disabled).toBe(false);
    button.click();
    expect(button.disabled).toBe(true);
  });

  it("offers project area paths from both the add box and each edit box", () => {
    editor();
    addInput().dispatchEvent(new Event("focus"));
    expect(
      [...document.querySelectorAll(".area-path-list-editor__add .combobox__option")].map(
        (option) => option.textContent,
      ),
    ).toEqual(SUGGESTIONS);

    const row = document.querySelector<HTMLInputElement>(".area-path-list-editor__row input")!;
    row.value = "api";
    row.dispatchEvent(new Event("input"));
    expect(
      [...document.querySelectorAll(".area-path-list-editor__row .combobox__option")].map(
        (option) => option.textContent,
      ),
    ).toEqual(["Project\\API"]);
  });

  it("adds one path at a time and ignores duplicates", () => {
    const { result, onChange } = editor("");
    addInput().value = " Project\\API ";
    addInput().dispatchEvent(new Event("input"));
    document.querySelector<HTMLButtonElement>(".area-path-list-editor__add button")!.click();

    expect(result.value).toBe("Project\\API");
    expect(onChange).toHaveBeenCalledTimes(1);
    addInput().value = "project\\api";
    addInput().dispatchEvent(new Event("input"));
    document.querySelector<HTMLButtonElement>(".area-path-list-editor__add button")!.click();
    expect(result.value).toBe("Project\\API");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("edits and removes individual paths", () => {
    const { result, onChange } = editor();
    const first = document.querySelector<HTMLInputElement>(".area-path-list-editor__row input")!;
    first.value = "Project\\API";
    first.dispatchEvent(new Event("change"));
    document.querySelectorAll<HTMLButtonElement>(".area-path-list-editor__remove")[1]!.click();

    expect(result.value).toBe("Project\\API");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("adds the typed path on Enter and disposes cleanly", () => {
    const { result } = editor("");
    addInput().value = "Project\\API";
    addInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(result.value).toBe("Project\\API");

    result.dispose();
    addInput().value = "Project\\Apps";
    addInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(result.value).toBe("Project\\API");
  });
});
