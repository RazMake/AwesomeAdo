import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import {
  renderEtaBadge,
  type EtaBadgeHandle,
  type EtaBadgeWording,
} from "../../../common/view-common/control/EtaBadge/EtaBadge";

import { writeItemEta } from "./writeItemEta";

/** What a row's editable ETA badge needs. */
export interface RowEtaOptions {
  doc: Document;
  item: TrackedWorkItem;
  types: ReadonlyMap<string, TypeCatalogEntry>;
  now: Date;
  queue: WorkItemWriteQueue;
  wording?: EtaBadgeWording;
}

/**
 * A row's editable ETA badge, pinned to the row's right edge, or null when the item's type declares
 * no ETA field — there is nothing to show or write, and a badge that could never be set would only
 * read as "No ETA" on every row of that type.
 */
export function renderRowEtaBadge(options: RowEtaOptions): HTMLElement | null {
  const { item, queue } = options;
  const field = options.types.get(item.type)?.etaField ?? null;
  if (field === null) return null;
  const badge: { handle?: EtaBadgeHandle } = {};
  badge.handle = renderEtaBadge(options.doc, {
    eta: item.eta,
    now: options.now,
    wording: options.wording,
    onChange: (eta) =>
      writeItemEta(item, eta, field, queue, (committed) => badge.handle?.setEta(committed)),
  });
  // One property at a time, never `cssText`: assigning that wipes the badge's OWN inline styles,
  // which is what took away its hand cursor and the `position:relative` its date picker is anchored
  // to — leaving an ETA that looked and behaved as if it could not be edited.
  badge.handle.style.flex = "0 0 auto";
  badge.handle.style.fontSize = "11px";
  // Pinned to the row's right edge so every row reports its date in one column down the list.
  badge.handle.style.marginLeft = "auto";
  return badge.handle;
}
