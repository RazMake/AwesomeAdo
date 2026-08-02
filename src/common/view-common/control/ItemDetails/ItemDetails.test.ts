import { describe, expect, it } from "vitest";

import { renderItemDetailsButton, renderItemDetailsContent } from "./ItemDetails";

describe("ItemDetails", () => {
  it("uses the accepted shared question-button states", () => {
    const button = renderItemDetailsButton(document, {
      hasDescription: true,
      typeColor: "#0078d4",
    });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    button.setExpanded(true);
    expect(button.title).toBe("Hide description");
    expect(button.style.background).toContain("#0078d4");
  });

  it("renders lifecycle metadata and description", () => {
    const content = renderItemDetailsContent(
      document,
      {
        description: "A useful description",
        createdDate: "2026-07-01T10:00:00Z",
        createdBy: null,
        changedDate: "2026-07-02T10:00:00Z",
        changedBy: null,
      },
      new Map(),
    );
    expect(content.textContent).toContain("Created on:");
    expect(content.textContent).toContain("Last Modified on:");
    expect(content.textContent).toContain("A useful description");
  });
});
