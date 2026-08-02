# `common/datetime`

Pure datetime utilities for Pacific Standard Time (PST) formatting and ETA countdown calculations,
used by Project Tracking views to render dates and target-date severity.

## Why this exists

Project Tracking views present dates/times in America/Los_Angeles (PST/PDT) so all team members see
the same calendar day for a milestone regardless of their local timezone, and show ETA countdowns
color-coded by urgency (overdue / soon / upcoming / distant). These utilities are pure functions that
take ISO 8601 strings and a reference `Date`, so they are unit-testable without time-mocking and work
deterministically in any engine.

## Public API

### `isoEpoch.ts`

- `isoEpoch(iso)` — an ISO 8601 timestamp as epoch milliseconds, or `null` when it is absent or
  unparseable. The one place that decision is made: written per call site, "no timestamp" drifts
  between `NaN` (which loses every comparison silently) and `0` (which makes it the oldest thing in
  the list). Callers that need a different sentinel derive it (`isoEpoch(iso) ?? -Infinity`).

### `pstDateTime.ts`

- `formatPstDate(iso)` — formats an ISO 8601 timestamp as `MM/DD/YYYY` in America/Los_Angeles; returns
  `""` for invalid input.
- `formatPstDateInput(iso)` — formats an ISO 8601 timestamp as `yyyy-MM-dd` in America/Los_Angeles —
  the value shape an `<input type="date">` requires; returns `""` for invalid input.
- `formatPstTime(iso)` — formats an ISO 8601 timestamp as `h:mm AM/PM` PST; returns `""` for invalid
  input.
- `formatPstTooltip(iso)` — formats an ISO 8601 timestamp as `@ h:mm AM/PM PST` for tooltip hovers;
  returns `""` for invalid input.

### `etaCountdown.ts`

- `EtaSeverity` — `"overdue" | "soon" | "upcoming" | "distant"` for color-coded urgency buckets.
- `EtaCountdown` — `{ text, severity, color }`; describes how far away (or overdue) a target date is.
- `describeEtaCountdown(targetIso, now)` — computes the ETA countdown from `now` to the target's PST
  midnight; returns a human text (`"overdue by 3 days"` / `"due today"` / `"in 2 weeks 3 days"`),
  the severity bucket, and the severity's theme color role. Returns
  `{ text: "", severity: "distant", color: "var(--eta-distant)" }` for invalid input.
  Deterministic: same inputs always produce the same result.

## Usage guidance

- Pass ISO 8601 strings (from ADO's work item date fields) directly; the functions internally parse
  and apply the PST timezone.
- `describeEtaCountdown` compares whole PST calendar days (ignoring time-of-day), so midnight-to-midnight
  determines "today" vs. "tomorrow". Inject `now` so tests control the reference point.
- The severity buckets are fixed while their paint comes from the active theme: `--eta-overdue`,
  `--eta-soon`, `--eta-upcoming`, and `--eta-distant`.
