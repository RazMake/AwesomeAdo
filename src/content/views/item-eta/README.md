# Item ETA

`writeItemEta(item, eta, field, queue, onCommitted)` is the shared persist-then-reflect ETA operation
used by Project Tracking rows and the All Projects Catalog View. It enqueues the guarded write, folds
the committed revision back into the item, and invokes the UI callback only after success.

`field` is the caller's own type-specific ETA field (`TypeCatalogEntry.etaField`) rather than a fixed
name, because no Azure DevOps process agrees on which date means "ETA". A type that declares none has
nothing to write to, so its badge stays read-only and never reaches this function.

`renderRowEtaBadge({ doc, item, types, now, queue, wording? })` builds a row's editable ETA badge
pinned to the row's right edge and wired to `writeItemEta`, or returns `null` when the item's type
declares no ETA field. `wording` (e.g. `{ prefix: "Needed by", empty: "No needed-by date" }`) lets a
board name the date for what it means there. Used by the All Projects Catalog and Consumers View.
