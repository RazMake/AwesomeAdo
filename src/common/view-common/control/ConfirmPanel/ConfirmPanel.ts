/** One affirmative answer offered by a confirmation. */
export interface ConfirmChoice {
  label: string;
  /** Draws the accented button. At most one choice in a panel should carry it. */
  primary?: boolean;
  onChoose(): void;
}

/** What a confirmation states, and the answers it accepts. */
export interface ConfirmPanelOptions {
  /** What is about to happen, stated as the change itself rather than as a question. */
  summary: string;
  /** A second line: a further consequence, or the one decision only the reader can make. */
  detail?: string | null;
  /** The affirmative answers, in the order they are offered. */
  choices: readonly ConfirmChoice[];
  /** Dismisses the confirmation without changing anything. */
  onCancel(): void;
  /** Overrides the wording of the answer that changes nothing. */
  cancelLabel?: string;
}

/** How the accented answer and the quiet ones are drawn. */
const PRIMARY_COLORS = {
  border: "var(--communication-background)",
  background: "var(--communication-background)",
  color: "var(--text-on-communication-background)",
} as const;

const SECONDARY_COLORS = {
  border: "var(--control-border)",
  background: "transparent",
  color: "var(--text-primary-color)",
} as const;

/**
 * The one confirmation surface in the extension: what a command is about to do, and the answers to
 * it.
 *
 * Shared rather than written per command so that every irreversible-feeling action is asked the same
 * way and, more importantly, ANSWERS THE SAME QUESTION — "what will this do?" A confirmation whose
 * wording and buttons move between surfaces trains readers to click through it, which is worse than
 * having none at all.
 *
 * Deliberately not a modal of its own: callers already own a surface to host it (a context-menu
 * panel, a popup row), and a second overlay layer would have to re-solve dismissal, focus and
 * placement that those hosts have already solved.
 */
export function renderConfirmPanel(doc: Document, options: ConfirmPanelOptions): HTMLElement {
  const panel = doc.createElement("div");
  panel.className = "awesomeado-confirm";
  panel.style.cssText = "display:flex;flex-direction:column;gap:10px;font-size:12px";

  const summary = doc.createElement("div");
  summary.className = "awesomeado-confirm__summary";
  summary.textContent = options.summary;
  panel.append(summary);

  if (options.detail) {
    const detail = doc.createElement("div");
    detail.className = "awesomeado-confirm__detail";
    detail.textContent = options.detail;
    detail.style.color = "var(--text-secondary-color)";
    panel.append(detail);
  }

  panel.append(renderAnswers(doc, options));
  return panel;
}

/** The answer row: every affirmative choice, then the one that changes nothing. */
function renderAnswers(doc: Document, options: ConfirmPanelOptions): HTMLElement {
  const row = doc.createElement("div");
  row.className = "awesomeado-confirm__answers";
  row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end";
  for (const choice of options.choices) {
    row.append(renderAnswer(doc, choice.label, choice.primary === true, choice.onChoose));
  }
  // Last and quiet: the affirmative answers are what the reader opened this to decide between, and
  // Escape or an outside click already backs out of every surface this is hosted in.
  row.append(renderAnswer(doc, options.cancelLabel ?? "Cancel", false, options.onCancel));
  return row;
}

function renderAnswer(
  doc: Document,
  label: string,
  primary: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.className = "awesomeado-confirm__answer";
  button.type = "button";
  button.textContent = label;
  const colors = primary ? PRIMARY_COLORS : SECONDARY_COLORS;
  button.style.cssText = [
    "padding:4px 10px",
    "border-radius:4px",
    `border:1px solid ${colors.border}`,
    `background:${colors.background}`,
    `color:${colors.color}`,
    "font:inherit",
    "font-size:12px",
    "cursor:pointer",
  ].join(";");
  button.addEventListener("click", onClick);
  return button;
}
