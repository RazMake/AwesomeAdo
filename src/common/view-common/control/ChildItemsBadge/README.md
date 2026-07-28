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

### `renderChildItemsBadge(doc, options): HTMLElement`

Renders the badge as `completed / total` (e.g. `2 / 3`) in a discrete wash of `color`. Clicking it
toggles a popup with one row per child:

`{checkbox} {assignee} {title in its type color}{glyph → opens the item in ADO} {ETA}`

## Features

- **Domain-agnostic rows:** the assignee, ETA and completion writer are supplied by the caller, so
  the badge never has to know which field a change persists to or which queue serializes it.
- **Completion at a glance:** a ticked checkbox plus a struck-through, dimmed title, so the list
  answers "what is still open?" by shape alone. The box is drawn in a translucent grey rather than a
  themed neutral token — under Follow ADO those tokens resolve to ADO's own surface color, which
  erased the box and left the tick floating. The tick itself is green, picked per surface with
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
  Follow-ADO alike), and the rest uses ADO custom properties (`--callout-background-color`,
  `--palette-neutral-4`, `--palette-neutral-20`, `--text-primary-color`) with fallbacks. The
  completion checkbox is the deliberate exception: it uses fixed translucent greys, because its box
  has to stay visible against the popup surface that the neutral tokens resolve to under Follow ADO.
