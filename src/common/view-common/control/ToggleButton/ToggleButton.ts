import { renderHeaderTextButton } from "../HeaderButtons/HeaderButtons";

/** What a header toggle shows and what pressing it means. */
export interface ToggleButtonOptions {
  /** The class the owning view finds and styles the button by. */
  className: string;
  /** The visible text, the same in both states: the fill, not the wording, says which is in force. */
  label: string;
  pressed: boolean;
  /** The tooltip and accessible name while pressed — what releasing it would do. */
  pressedTitle: string;
  /** The tooltip and accessible name while released — what pressing it would do. */
  releasedTitle: string;
  /** Called after every press with the state the button now shows. */
  onToggle(pressed: boolean): void;
}

/**
 * The header's on/off switch: a button that stays pressed, filled with the theme's communication
 * color while on, so a narrowed board can never be mistaken for the full one.
 */
export function renderToggleButton(doc: Document, options: ToggleButtonOptions): HTMLButtonElement {
  const button = renderHeaderTextButton(doc, {
    className: options.className,
    label: options.label,
  });

  let pressed = options.pressed;
  const paint = (): void => {
    button.setAttribute("aria-pressed", String(pressed));
    button.title = pressed ? options.pressedTitle : options.releasedTitle;
    button.setAttribute("aria-label", button.title);
    button.style.background = pressed ? "var(--communication-background)" : "transparent";
    button.style.color = pressed
      ? "var(--text-on-communication-background)"
      : "var(--text-primary-color)";
    button.style.borderColor = pressed
      ? "var(--communication-background)"
      : "var(--control-border-strong)";
  };

  button.addEventListener("click", () => {
    pressed = !pressed;
    paint();
    options.onToggle(pressed);
  });
  paint();
  return button;
}
