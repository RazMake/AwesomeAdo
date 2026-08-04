# ConfirmPanel

The one confirmation surface in the extension: a plain statement of what a command is about to do,
followed by the answers it accepts. Used by every action that marks work complete, so all of them
ask the same question the same way.

## Usage

```ts
import { renderConfirmPanel } from "../../common/view-common/control/ConfirmPanel/ConfirmPanel";

const panel = renderConfirmPanel(doc, {
  summary: 'This project will be set to "Closed".',
  detail: "Delete its tracking query as well? The query, its link and the binding all go.",
  choices: [
    { label: "Complete and delete query", primary: true, onChoose: () => completeAndDelete() },
    { label: "Complete", onChoose: () => complete() },
  ],
  onCancel: close,
});
```

| Option        | Meaning                                                                              |
| ------------- | ------------------------------------------------------------------------------------ |
| `summary`     | What is about to happen, written as the change itself rather than as a question.     |
| `detail`      | Optional second line: a further consequence, or a decision only the reader can make. |
| `choices`     | The affirmative answers, in the order offered. At most one carries `primary`.        |
| `onCancel`    | Dismisses without changing anything.                                                 |
| `cancelLabel` | Overrides the wording of the answer that changes nothing (default `Cancel`).         |

## Behaviour

- **It states, it does not ask.** The summary names the concrete outcome — the state an item lands
  in, the thing that gets deleted — because a confirmation that only says "Are you sure?" carries no
  information the reader did not already have.
- **The answer that changes nothing comes last** and is never accented, so the accented button is
  always the one the reader opened the panel to choose.
- **It hosts nothing of its own.** No overlay, no dismissal handling, no focus trap: callers mount it
  inside a surface that already solves those (a context-menu panel, a popup row), and a second layer
  would only re-solve them differently.

Rendered elements carry `awesomeado-confirm`, `awesomeado-confirm__summary`,
`awesomeado-confirm__detail`, `awesomeado-confirm__answers` and `awesomeado-confirm__answer` class
names so a host can find and style them.
