/**
 * The attribute that tags a control with its logical "role" inside a row, so a single delegated
 * listener on the row container can dispatch on `event.target`'s role instead of wiring each control.
 * Shared by the area-path and marker-tag sections so both agree on one attribute name.
 */
export const ROLE_ATTRIBUTE = "data-role";

/**
 * Create a role-tagged text input the way every ado-config row needs it (autocomplete off, an aria
 * label, the shared `data-role` hook, a placeholder, and a seed value). Shared by the area-path and
 * marker-tag rows, which built structurally identical inputs before this was extracted.
 */
export function createRoleInput(
  doc: Document,
  role: string,
  ariaLabel: string,
  value: string,
  placeholder: string = ariaLabel,
): HTMLInputElement {
  const input = doc.createElement("input");
  input.type = "text";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("aria-label", ariaLabel);
  input.setAttribute(ROLE_ATTRIBUTE, role);
  input.placeholder = placeholder;
  input.value = value;
  return input;
}
