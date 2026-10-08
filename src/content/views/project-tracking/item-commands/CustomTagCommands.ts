import {
  formatWorkItemTags,
  withWorkItemTag,
  withoutWorkItemTag,
} from "../../../../common/ado/workItemTags";
import type { ItemContextMenuCommand } from "../../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import { renderTextEditor } from "../../../../common/view-common/control/TextEditor/TextEditor";

import { EDITOR_WIDTH_PX, panelFor, writeField, type ItemCommandTarget } from "./itemCommandCore";

const TAGS_FIELD = "System.Tags";

export interface CustomTagCommandsOptions extends ItemCommandTarget {
  /** Every tag currently used by peers on this view, offered before the free-text choice. */
  knownTags: readonly string[];
  /** Tags the current view depends on and therefore must not offer for removal. */
  protectedTags: ReadonlySet<string>;
  /** User-facing entity name used by diagnostics after a committed change. */
  itemKind: string;
  /** Explains why the clear command has no choices. */
  noRemovableTagsReason: string;
}

/** Add and clear arbitrary Azure DevOps tags through the board's guarded write queue. */
export function buildCustomTagCommands(
  options: CustomTagCommandsOptions,
): ItemContextMenuCommand[] {
  return [{ ...addTagCommand(options), separatorBefore: true }, clearTagCommand(options)];
}

function addTagCommand(options: CustomTagCommandsOptions): ItemContextMenuCommand {
  return {
    label: "Add custom tag",
    submenu: () => {
      const worn = new Set(options.item.tags.map((tag) => tag.trim().toLowerCase()));
      const offered = options.knownTags.filter((tag) => !worn.has(tag.toLowerCase()));
      return [
        {
          label: "New tag…",
          separatorBefore: offered.length > 0,
          panel: (close) => newTagPanel(options, close),
        },
        ...offered.map((tag) => ({
          label: tag,
          run: () => void applyTag(options, tag),
        })),
      ];
    },
  };
}

function newTagPanel(options: CustomTagCommandsOptions, close: () => void): HTMLElement {
  return panelFor(options.doc, options.item, { withTitle: true, widthPx: EDITOR_WIDTH_PX }, [
    renderTextEditor(options.doc, {
      initialText: "",
      submitLabel: "Add",
      singleLine: true,
      placeholder: "New tag",
      onSubmit: async (text) => {
        const written = await applyTag(options, text);
        if (written) close();
        return written;
      },
      onCancel: close,
    }),
  ]);
}

function clearTagCommand(options: CustomTagCommandsOptions): ItemContextMenuCommand {
  const removable = (): string[] =>
    options.item.tags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0 && !options.protectedTags.has(tag.toLowerCase()));
  return {
    label: "Clear custom tag",
    disabledReason: removable().length === 0 ? options.noRemovableTagsReason : null,
    submenu: () =>
      removable().map((tag) => ({
        label: tag,
        run: () => void removeTag(options, tag),
      })),
  };
}

async function setTags(options: CustomTagCommandsOptions, next: string[]): Promise<boolean> {
  const written = await writeField(options, {
    field: TAGS_FIELD,
    value: formatWorkItemTags(next),
    // A rebase is safe only while the server still carries the tag list this change derived from.
    baseValue: formatWorkItemTags(options.item.tags),
  });
  if (written) {
    options.item.tags = next;
    options.onChanged();
  }
  return written;
}

async function applyTag(options: CustomTagCommandsOptions, tag: string): Promise<boolean> {
  const trimmed = tag.trim();
  if (trimmed.length === 0) return false;
  const written = await setTags(options, withWorkItemTag(options.item.tags, trimmed));
  if (written) {
    options.services.logger.info(
      `${options.itemKind} ${options.item.id} tagged "${trimmed}"; it now carries ${options.item.tags.length} tag(s).`,
    );
  }
  return written;
}

async function removeTag(options: CustomTagCommandsOptions, tag: string): Promise<void> {
  if (await setTags(options, withoutWorkItemTag(options.item.tags, tag))) {
    options.services.logger.info(
      `${options.itemKind} ${options.item.id} untagged "${tag}"; it now carries ${options.item.tags.length} tag(s).`,
    );
  }
}
