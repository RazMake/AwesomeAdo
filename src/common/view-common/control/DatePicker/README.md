# DatePicker

A small, theme-aware month calendar for picking a single day.

It exists because the browser's native `<input type="date">` picker cannot be themed (it renders in
the browser's own color scheme, not the view's), cannot be kept inside the window, and routes a pick
through a native `change` event. Owning the calendar means a pick is an ordinary click handler in the
extension's DOM, so the chosen day reaches the caller directly.

Days are exchanged as `yyyy-MM-dd` strings — never `Date` objects — so no local-timezone conversion
can shift the day the user sees.

## API

```typescript
interface DatePickerOptions {
  /** The currently selected calendar day as `yyyy-MM-dd`, or null when nothing is selected. */
  selected: string | null;
  /** Today's calendar day as `yyyy-MM-dd`, or null to draw no "today" marker. */
  today: string | null;
  /** Called with the picked day as `yyyy-MM-dd`. */
  onPick: (day: string) => void;
}

function renderDatePicker(doc: Document, options: DatePickerOptions): HTMLElement;
```

`today` is **injected** rather than read from the clock: the caller decides which timezone "today"
means (the enhanced views reckon dates in PST), and tests stay deterministic.

## Behavior

- Opens on the month of `selected`, falling back to the month of `today`.
- The header's ◀ / ▶ buttons step the displayed month, rolling the year over at the boundaries.
- The selected day is filled with the theme's accent color; today is outlined.
- Clicking a day calls `onPick` with that day. The calendar does not keep its own selection — the
  caller re-renders (or dismisses) it after persisting.

## Usage

```typescript
import { renderDatePicker } from "common/view-common/control/DatePicker/DatePicker";

const calendar = renderDatePicker(document, {
  selected: "2026-08-15",
  today: "2026-07-25",
  onPick: (day) => save(`${day}T12:00:00Z`),
});
popup.appendChild(calendar);
```

## Styling hooks

`.awesomeado-datepicker`, `.awesomeado-datepicker__header`, `.awesomeado-datepicker__month`,
`.awesomeado-datepicker__nav` (`--previous` / `--next`), `.awesomeado-datepicker__weekdays`,
`.awesomeado-datepicker__grid`, `.awesomeado-datepicker__day` (each carrying `data-day`).
