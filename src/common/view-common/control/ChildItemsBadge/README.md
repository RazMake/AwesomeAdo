# ChildItemsBadge Control

A "completed / total" badge for an item's direct children — tinted from their work item type — with
a click-through popup listing each child.

## Usage

```typescript
import { renderChildItemsBadge, type ChildItemDescriptor } from "path/to/ChildItemsBadge";

const badge = renderChildItemsBadge(document, {
  completedCount: 2,
  color: "#F2CB1D",
  children: [
    {
      assignee: renderAssignedTo(document, { user: alice, userDirectory: myUserDirectory }),
      done: false,
      onToggleDone: (done) => persistCompletion(item, done), // resolves with what committed
      title: "Wire up the loader",
      titleColor: "#0078D4",
      eta: renderEtaBadge(document, { eta: "2026-09-01T00:00:00Z", now: new Date() }),
      url: "https://dev.azure.com/org/project/_workitems/edit/42",
    },
    // …two more children (total 3), of which 2 are completed → badge shows "2 / 3"
  ],
});
```

## Public API

### `ChildItemsBadgeOptions`

- **`children: ChildItemDescriptor[]`** — The direct children summarized by the badge and listed in
  its popup. `children.length` is the denominator of "completed / total".
- **`initiallyOpen?: boolean`** — Opens the popup as soon as the badge is rendered. Defaults to
  `false`; useful when a caller replaces the badge while preserving an in-progress interaction. The
  automatic open waits until the rebuilt badge is mounted so the popup keeps its measured alignment.
- **`completedCount: number`** — How many children are completed (the numerator). Completion is a
  board-column decision the **caller** owns, so it is passed in rather than derived here.
- **`color?: string | null`** — The color the badge's discrete tint derives from (hex, with or
  without a leading `#`) — normally the work item type of the children it summarizes. Omitted,
  `null`, or unparseable falls back to a neutral themed chip.

### `ChildItemDescriptor`

- **`assignee: HTMLElement | null`** — The child's assignee control, built by the caller (typically
  the shared [`AssignedTo`](../AssignedTo/README.md)) so the write path stays with the owning view;
  `null` renders no assignee for that row.
- **`done: boolean`** — Whether the child is finished. Ticks the row's checkbox and strikes its title
  through. Which board column counts as finished is the **caller's** decision.
- **`onToggleDone?: (done: boolean) => Promise<boolean>`** — Persists a completion toggle, resolving
  with the completion that **actually committed**. Omitted leaves the checkbox a read-only indicator
  (disabled, no pointer cursor).
- **`title: string`** — The child's title.
- **`titleColor: string | null`** — The child's type color (hex, **with** a leading `#`); `null`
  uses the theme's primary text color.
- **`eta: HTMLElement | null`** — The child's ETA control, built by the caller (typically the shared
  [`EtaBadge`](../EtaBadge/README.md)) so the write path stays with the owning view; `null` renders
  no ETA for that row.
- **`url: string | null`** — The ADO web URL that opens the item; `null` renders the affordance inert.
- **`onContextMenu?: (event: MouseEvent) => void`** — Called when the row is right-clicked, so the
  owning view can offer the same per-item menu here as on its own rows (typically
  [`ItemContextMenu`](../ItemContextMenu/README.md)). The badge stays menu-agnostic: it reports the
  gesture and the caller decides what it opens. Omitted leaves the browser's own menu alone.
- **`onRowReady?: (row: HTMLElement, title: HTMLElement) => void`** — Called after the popup row is
  assembled, so the owning view can add behavior such as drag-to-reorder while keeping item identity
  and persistence outside this domain-agnostic control.

### `renderChildItemsBadge(doc, options): HTMLElement`

Renders the badge as `completed / total` (e.g. `2 / 3`) in a discrete wash of `color`. Clicking it
toggles a popup with one row per child:

`{checkbox} {assignee} {title in its type color}{glyph → opens the item in ADO} {ETA}`

## Features

- **Domain-agnostic rows:** the assignee, ETA and completion writer are supplied by the caller, so
  the badge never has to know which field a change persists to or which queue serializes it.
- **Completion at a glance:** a ticked checkbox plus a struck-through, dimmed title, so the list
  answers "what is still open?" by shape alone. The box is drawn in a translucent grey rather than a
  themed neutral surface wash, which can be too subtle to frame the tick. The tick itself is green,
  picked per surface with
  `light-dark()` (the view host always declares a concrete `color-scheme`) and falling back to the
  board's shared "done" green where that is unsupported, because "finished" is meaning rather than
  decoration. Toggling is **persist-then-reflect** — the row is held busy for the width of the write
  and only takes the completion the caller reports as committed, so a rejected write never leaves a
  tick ADO did not accept.
- **Type-colored titles** via the caller-supplied `titleColor`, inserted as `textContent` (no HTML
  injection). The strike-through lands on the words only, so it is never dragged across the glyph
  beside them.
- **Caller-owned ETA**: the badge places the element it is handed, so an editable ETA keeps its
  persist-then-reflect flow (and its write queue) in the view that owns the data.
- **One child per line, wherever it fits:** the popup takes its width from its rows
  (`width: max-content`) and is capped only by the viewport. A title wraps only when even that is not
  enough, and then breaks mid-token only for a single unbroken word. The explicit width matters: the
  popup is absolutely positioned inside the badge's own ~30px root, so left to shrink-to-fit it would
  collapse onto its `min-width` and wrap titles one character per line.
- **Line-one controls:** under a wrapped title the checkbox, assignee and ETA stay centered on the
  title's **first** line, while the open glyph rides inline and follows its **last** word.
- **Row hover wash** marks which child the controls under the pointer belong to.
- **Open in Azure DevOps** through a `target="_blank"`, `rel="noopener noreferrer"` link so the
  opened tab cannot reach back into the extension's page context. The affordance is an inline
  `currentColor` arrow-out-of-a-box glyph nested in the title, so it always paints in the title's own
  color.
- **Dismissal parity with `StatusBadge`:** the popup closes on an outside click, a second badge
  click, or Escape.
- **Theme-aware:** the tint is a low-alpha wash of the supplied hue (so it reads on light, dark, and
  Follow-ADO alike), while fixed chrome comes from the complete AwesomeADO theme contract. The
  completion checkbox uses dedicated control border, fill, and completion roles so it remains
  distinct from the popup surface.
