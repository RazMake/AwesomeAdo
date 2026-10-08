import {
  renderHeaderTextButton,
  setHeaderButtonAvailability,
} from "../../../../common/view-common/control/HeaderButtons/HeaderButtons";
import type { ItemContextMenuCommand } from "../../../../common/view-common/control/ItemContextMenu/ItemContextMenu";

const ENABLED_TITLE = "Add a new consumer to this board";
export const REQUESTS_MODE_REASON = "Turn on Show consumers to add a consumer";
export const NO_GROUPING_REASON = "This query has no top item to add consumers under";

export interface AddConsumerButtonOptions {
  doc: Document;
  className: string;
  /** Whether the board is showing the consumer cards rather than the requests list. */
  showConsumers: boolean;
  /** The Add new consumer command, or null when the query has no grouping item. */
  command: ItemContextMenuCommand | null;
  /** Opens the command's form beneath the button. */
  openPanel(button: HTMLElement, command: ItemContextMenuCommand): void;
}

/** Why the button cannot add a consumer right now, or null when it can. */
function unavailableReason(options: AddConsumerButtonOptions): string | null {
  if (options.command === null) return NO_GROUPING_REASON;
  if (!options.showConsumers) return REQUESTS_MODE_REASON;
  return options.command.disabledReason ?? null;
}

/**
 * The header's **Add Consumer** button, opening the same form as the menus' Add new consumer.
 *
 * Available only while the consumer cards are shown: the requests list has no consumers on screen,
 * so a consumer added there would appear nowhere the reader is looking.
 */
export function renderAddConsumerButton(options: AddConsumerButtonOptions): HTMLButtonElement {
  const button = renderHeaderTextButton(options.doc, {
    className: options.className,
    label: "Add Consumer",
  });
  setHeaderButtonAvailability(button, unavailableReason(options), ENABLED_TITLE);
  const { command } = options;
  if (command !== null) button.addEventListener("click", () => options.openPanel(button, command));
  return button;
}
