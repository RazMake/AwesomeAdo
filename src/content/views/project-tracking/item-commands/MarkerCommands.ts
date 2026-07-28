import {
  formatWorkItemTags,
  hasWorkItemTag,
  withWorkItemTag,
  withoutWorkItemTag,
} from "../../../../common/ado/workItemTags";
import type { MarkerTags, WorkItemMarker } from "../../../../common/settings/ExtensionSettings";
import type { ItemContextMenuCommand } from "../../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import {
  markerLabel,
  renderMarkerPill,
} from "../../../../common/view-common/control/MarkerPill/MarkerPill";
import { renderTextEditor } from "../../../../common/view-common/control/TextEditor/TextEditor";

import {
  EDITOR_WIDTH_PX,
  finish,
  panelFor,
  writeField,
  type ItemCommandTarget,
} from "./itemCommandCore";

/** The Azure DevOps field holding an item's tags, as one semicolon-separated string. */
const TAGS_FIELD = "System.Tags";

/**
 * The conditions a view offers to flag from the right-click menu, in the order they are shown.
 *
 * Deliberately NOT every marker the settings recognize: "interrupt" describes where a piece of work
 * came FROM and is set when the item is created, while these two describe something that is true
 * right now and changes as the item is worked — which is what makes them worth one click on a board.
 * The board still FILTERS by every configured marker; this list only governs what can be applied.
 */
const TAGGABLE_MARKERS: readonly WorkItemMarker[] = ["blocked", "blockedByOtherTeam"];

/** What an unconfigured marker's command says instead of running. */
function unconfiguredReason(marker: WorkItemMarker): string {
  return (
    `No Azure DevOps tag is configured for "${markerLabel(marker)}". ` +
    "Set one under Options → Azure DevOps → Marker tags."
  );
}

/**
 * The commands that flag an item with one of the team's recognized conditions, or take that flag
 * back off it.
 *
 * Returned as their own group (the first carries `separatorBefore`) because they answer a different
 * question from the editing commands above them: those change what the item SAYS, these change what
 * the board says ABOUT it. A view that does not want them simply does not ask for them — which is
 * what keeps "flag this item" out of a menu on a surface where flagging means nothing.
 */
export function buildMarkerCommands(target: ItemCommandTarget): ItemContextMenuCommand[] {
  const configured = target.services.markerTags();
  return TAGGABLE_MARKERS.map((marker, index) => ({
    ...markerCommand(target, marker, configured[marker]),
    separatorBefore: index === 0,
  }));
}

/** The one command for a marker: apply it with a comment, or clear it when the item already wears it. */
function markerCommand(
  target: ItemCommandTarget,
  marker: WorkItemMarker,
  tags: MarkerTags,
): ItemContextMenuCommand {
  const applied = hasWorkItemTag(target.item.tags, tags.tag);
  const verb = applied ? "Clear" : "Tag with";
  const command: ItemContextMenuCommand = {
    // The pill IS the label's second half, so the reader sees the exact badge the item will wear
    // rather than a description of it; `label` still names the command for assistive technology.
    label: `${verb} ${markerLabel(marker)}`,
    renderLabel: (doc) => [
      doc.createTextNode(`${verb} `),
      renderMarkerPill(doc, { marker, title: `Azure DevOps tag "${tags.tag}"` }),
    ],
  };

  if (tags.tag.length === 0) {
    // Left in place, dimmed, rather than dropped: a menu whose commands come and go depending on
    // settings the reader cannot see from here is harder to use than one that says why it is inert.
    return { ...command, disabledReason: unconfiguredReason(marker) };
  }

  return applied
    ? { ...command, run: () => void clearMarker(target, marker, tags.tag) }
    : { ...command, panel: (close) => commentPanel(target, marker, tags, close) };
}

/**
 * The mandatory reason a flag is applied with.
 *
 * Asked for BEFORE anything is written, because the tag on its own says nothing actionable —
 * "blocked" without a reason is a question, not an answer. The editor rejects an empty submission
 * (`allowEmpty` defaults to false), which is what makes the reason mandatory rather than merely
 * offered.
 */
function commentPanel(
  target: ItemCommandTarget,
  marker: WorkItemMarker,
  tags: MarkerTags,
  close: () => void,
): HTMLElement {
  const { doc, item } = target;
  return panelFor(doc, item, { withTitle: true, widthPx: EDITOR_WIDTH_PX }, [
    renderTextEditor(doc, {
      initialText: "",
      submitLabel: "Save",
      placeholder: `Why is this ${markerLabel(marker).toLowerCase()}?`,
      onSubmit: (text) => applyMarker(target, marker, tags, text, close),
      onCancel: close,
    }),
  ]);
}

/**
 * Apply the flag: the tag and the reason for it, in ONE patch.
 *
 * They must not be two writes. Posting a comment through the comments API creates its own work item
 * revision, so a tag written after one was rejected by its `test /rev` guard with **HTTP 412, every
 * single time** — leaving items commented but never flagged — and a tag written *before* one can
 * succeed while the comment explaining it fails, which is the exact state this command exists to
 * prevent. Riding the comment along in the field patch (`System.History`) makes them a single
 * revision: both land or neither does, and there is no ordering left to get wrong.
 *
 * A rejected patch leaves the editor open with the author's words still in it, so nothing they typed
 * is lost and the board never claims a flag it did not manage to write.
 */
async function applyMarker(
  target: ItemCommandTarget,
  marker: WorkItemMarker,
  tags: MarkerTags,
  text: string,
  close: () => void,
): Promise<boolean> {
  // The team's own comment token, so the note reads the way their existing ones do. A team that
  // configured no token gets the bare comment rather than a stray space.
  const comment = tags.commentTag.length > 0 ? `${tags.commentTag} ${text}` : text;

  if (!(await setTags(target, withWorkItemTag(target.item.tags, tags.tag), comment))) {
    // The queue already logged and counted the rejected patch, and nothing was written at all — the
    // author simply keeps their words and can try again.
    return false;
  }

  logMarkerChange(target, marker, tags.tag, true);
  finish(target, close);
  return true;
}

/**
 * Take the flag back off, with no reason asked for.
 *
 * Deliberately asymmetric with applying one: a flag records a reason because the board is about to
 * tell everyone the item is stuck, whereas removing it only says that is no longer true — and a
 * mandatory box in the way of that would leave stale flags on the board rather than prevent them.
 */
async function clearMarker(
  target: ItemCommandTarget,
  marker: WorkItemMarker,
  tag: string,
): Promise<void> {
  if (!(await setTags(target, withoutWorkItemTag(target.item.tags, tag)))) {
    // The queue logged the rejection; nothing on screen changed, so the board still shows the flag.
    return;
  }
  logMarkerChange(target, marker, tag, false);
  target.onChanged();
}

/**
 * Persist a new tag list onto the item, optionally with the reason in the same revision, folding it
 * back on success (persist first, reflect second).
 *
 * The tags the item wore travel along as the change's base value, because this list was DERIVED from
 * them. Plenty of things advance an item's rev without the board ever hearing the new one — a
 * drag-reorder, the rank fallback, a note posted from the panel — and without a base value the very
 * next flag on that item is refused with HTTP 412 until the board is reloaded, which is not a state
 * a one-click command may leave the user in. Naming the base keeps that rescue honest: a rebase
 * happens only while the tags are still the ones this change was computed from.
 */
async function setTags(
  target: ItemCommandTarget,
  next: string[],
  comment?: string,
): Promise<boolean> {
  const written = await writeField(target, {
    field: TAGS_FIELD,
    value: formatWorkItemTags(next),
    baseValue: formatWorkItemTags(target.item.tags),
    comment,
  });
  if (written) {
    target.item.tags = next;
  }
  return written;
}

/**
 * Record a flag being applied or cleared: a rare, deliberate change to what the board says about a
 * piece of work, and the one an "why is this showing as blocked?" question is answered from.
 */
function logMarkerChange(
  target: ItemCommandTarget,
  marker: WorkItemMarker,
  tag: string,
  applied: boolean,
): void {
  target.services.logger.info(
    `Item ${target.item.id} ${applied ? "tagged" : "untagged"} "${tag}" ` +
      `for marker=${marker}; tags now [${target.item.tags.join(", ")}].`,
  );
}
