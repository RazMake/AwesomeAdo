import { ensureControlStyles } from "../controlStyles/controlStyles";

/** Options for rendering the calendar. */
export interface DatePickerOptions {
  /** The currently selected calendar day as `yyyy-MM-dd`, or null when nothing is selected. */
  selected: string | null;
  /**
   * Today's calendar day as `yyyy-MM-dd`, or null to draw no "today" marker. It is injected (rather
   * than read from the clock here) so the caller decides which timezone "today" means — the views
   * reckon dates in PST — and so tests stay deterministic.
   */
  today: string | null;
  /** Called with the picked day as `yyyy-MM-dd`. */
  onPick: (day: string) => void;
}

const STYLE_ID = "awesomeado-datepicker-style";

// Hover feedback is the one thing an inline style cannot express, so it lives in the single
// id-guarded control stylesheet. A translucent grey overlay reads on light and dark themes alike.
const STYLES = [
  ".awesomeado-datepicker__day:hover:not(:disabled)",
  ",.awesomeado-datepicker__nav:hover",
  "{background:rgba(128,128,128,0.3);}",
].join("");

// A fixed mid-grey edge: ADO's own neutral tokens are too faint to draw a visible border under the
// "Follow ADO" theme, and a border is what separates the calendar from the row behind it.
const BORDER_COLOR = "rgba(128,128,128,0.45)";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** A calendar day split into its numeric parts (month is 1-based, as it reads in `yyyy-MM-dd`). */
interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

/**
 * Parse a `yyyy-MM-dd` day, or null when it is absent or malformed. The parts are kept as plain
 * numbers — never a `Date` — because every calculation below is calendar arithmetic: constructing a
 * local `Date` would re-interpret the day in the browser's timezone and can shift it by one.
 */
function parseDay(day: string | null): CalendarDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "");
  if (match === null) {
    return null;
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Render a day back to the `yyyy-MM-dd` shape the caller speaks. */
function formatDay(year: number, month: number, day: number): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${String(year)}-${pad(month)}-${pad(day)}`;
}

// UTC is used purely as a calendar calculator here (day 0 of the next month is the last day of this
// one); it never leaks out, so no local-timezone shift can reach the rendered grid.
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

/** Step the displayed month by ±1, rolling the year over at the boundaries. */
function stepMonth(view: CalendarDay, delta: number): CalendarDay {
  const zeroBased = view.month - 1 + delta;
  const year = view.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12;
  return { year, month: month + 1, day: 1 };
}

function styleNavButton(button: HTMLButtonElement): void {
  button.style.cssText = [
    "cursor:pointer",
    "font:inherit",
    "line-height:1",
    "color:var(--text-primary-color, #323130)",
    "background:transparent",
    `border:1px solid ${BORDER_COLOR}`,
    "border-radius:3px",
    "padding:2px 8px",
  ].join(";");
}

/** The displayed month as "July 2026". */
function monthLabel(view: CalendarDay): string {
  return `${MONTH_NAMES[view.month - 1] ?? ""} ${String(view.year)}`;
}

/**
 * The month header: previous / month-year / next. The step buttons are handed back unwired so the
 * caller can attach the handler that re-renders the grid it owns.
 */
function renderHeader(
  doc: Document,
  view: CalendarDay,
): {
  element: HTMLElement;
  label: HTMLElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
} {
  const header = doc.createElement("div");
  header.className = "awesomeado-datepicker__header";
  header.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    "gap:6px",
    "margin-bottom:6px",
  ].join(";");

  const previous = doc.createElement("button");
  previous.type = "button";
  previous.className = "awesomeado-datepicker__nav awesomeado-datepicker__nav--previous";
  previous.textContent = "\u25C0\uFE0E";
  previous.title = "Previous month";
  styleNavButton(previous);

  const label = doc.createElement("span");
  label.className = "awesomeado-datepicker__month";
  label.style.cssText = "font-weight:600;white-space:nowrap";
  label.textContent = monthLabel(view);

  const next = doc.createElement("button");
  next.type = "button";
  next.className = "awesomeado-datepicker__nav awesomeado-datepicker__nav--next";
  next.textContent = "\u25B6\uFE0E";
  next.title = "Next month";
  styleNavButton(next);

  header.append(previous, label, next);
  return { element: header, label, previous, next };
}

/** The fixed weekday initials above the grid. */
function renderWeekdayRow(doc: Document): HTMLElement {
  const row = doc.createElement("div");
  row.className = "awesomeado-datepicker__weekdays";
  row.style.cssText = "display:grid;grid-template-columns:repeat(7,26px);gap:2px";
  for (const name of WEEKDAY_NAMES) {
    const cell = doc.createElement("span");
    cell.textContent = name;
    cell.style.cssText = [
      "text-align:center",
      "font-size:10px",
      "color:var(--text-secondary-color, #8a8886)",
    ].join(";");
    row.append(cell);
  }
  return row;
}

/** Tint a day cell for its role: the picked day, today, or an ordinary day. */
function styleDayCell(cell: HTMLButtonElement, isSelected: boolean, isToday: boolean): void {
  const border = isToday ? `1px solid ${BORDER_COLOR}` : "1px solid transparent";
  cell.style.cssText = [
    "cursor:pointer",
    "font:inherit",
    "text-align:center",
    "padding:2px 0",
    "border-radius:3px",
    `border:${border}`,
    "background:transparent",
    "color:var(--text-primary-color, #323130)",
  ].join(";");
  if (isSelected) {
    // The selected day wears the theme's accent so it is unmistakable on any background.
    cell.style.background = "var(--communication-background, #0078d4)";
    cell.style.color = "var(--text-on-communication-background, #ffffff)";
    cell.style.fontWeight = "600";
  }
}

/** The month's day grid, with the leading blanks that align the 1st under its weekday. */
function renderGrid(doc: Document, view: CalendarDay, options: DatePickerOptions): HTMLElement {
  const grid = doc.createElement("div");
  grid.className = "awesomeado-datepicker__grid";
  grid.style.cssText = "display:grid;grid-template-columns:repeat(7,26px);gap:2px";

  for (let blank = 0; blank < firstWeekdayOfMonth(view.year, view.month); blank += 1) {
    grid.append(doc.createElement("span"));
  }

  for (let day = 1; day <= daysInMonth(view.year, view.month); day += 1) {
    const value = formatDay(view.year, view.month, day);
    const cell = doc.createElement("button");
    cell.type = "button";
    cell.className = "awesomeado-datepicker__day";
    cell.dataset.day = value;
    cell.textContent = String(day);
    styleDayCell(cell, value === options.selected, value === options.today);
    // Committing straight from the click is what makes picking a date reliable: there is no native
    // picker in the loop and no intermediate "change" event that a re-render could swallow.
    cell.addEventListener("click", () => options.onPick(value));
    grid.append(cell);
  }

  return grid;
}

/**
 * A small, theme-aware month calendar.
 *
 * It replaces the browser's native date picker, which cannot be themed (it renders in the browser's
 * own color scheme, not Azure DevOps') and cannot be positioned. Owning the calendar also means a
 * pick is an ordinary click handler in our DOM, so the value reaches the caller directly.
 *
 * The element is returned for the caller to mount; the caller supplies `selected` and `today` as
 * `yyyy-MM-dd` strings and receives the same shape back from `onPick`.
 */
export function renderDatePicker(doc: Document, options: DatePickerOptions): HTMLElement {
  ensureControlStyles(doc, STYLE_ID, STYLES);

  const root = doc.createElement("div");
  root.className = "awesomeado-datepicker";
  root.style.cssText = [
    "display:inline-block",
    "font:inherit",
    "color:var(--text-primary-color, #323130)",
    "padding:6px",
    `border:1px solid ${BORDER_COLOR}`,
    "border-radius:3px",
    "background:var(--callout-background-color, var(--background-color, #fff))",
  ].join(";");

  // The month on show starts at the selected day, else today, else the current UTC month — the
  // caller always passes one of the first two, so the last is only a defensive floor.
  let view = parseDay(options.selected) ??
    parseDay(options.today) ?? { year: new Date().getUTCFullYear(), month: 1, day: 1 };

  const header = renderHeader(doc, view);
  let grid = renderGrid(doc, view, options);

  const step = (delta: number): void => {
    view = stepMonth(view, delta);
    header.label.textContent = monthLabel(view);
    const replacement = renderGrid(doc, view, options);
    grid.replaceWith(replacement);
    grid = replacement;
  };
  header.previous.addEventListener("click", () => step(-1));
  header.next.addEventListener("click", () => step(1));

  root.append(header.element, renderWeekdayRow(doc), grid);
  return root;
}
