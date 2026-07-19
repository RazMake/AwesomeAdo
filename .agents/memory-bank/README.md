# Memory Bank

This directory is the shared coordination memory for all agents working on the AwesomeADO project.

## Protocol

- **All agents read this directory before starting any task.** Do not begin work without first
  reviewing every file here so your changes stay coherent with what others have done.
- **Parallel workers NEVER edit shared memory files.** Return a concise `Memory-bank delta`
  section in your §4.1 response instead (see AGENTS.md for the exact format).
- **The serial coordinator applies deltas at each wave barrier.** After all parallel workers in a
  wave finish, one coordinator merges their deltas into `activeContext.md`, `progress.md`, and
  `decisions.md` before starting the next wave.
- Wave 0A is the only bootstrap exception: it creates this memory bank before later agents can read
  it.

## File index

| File                | One-line purpose                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `projectbrief.md`   | North star: what AwesomeADO is and its current scope boundaries.                                    |
| `productContext.md` | Problem being solved, target audience, and desired UX.                                              |
| `techContext.md`    | Full technology stack, runtime environment, and toolchain decisions.                                |
| `systemPatterns.md` | Layer map, composition roots, single-source-of-truth rules, SOLID mapping, and performance posture. |
| `activeContext.md`  | Flattened snapshot of the current state and the shared abstractions to build on.                    |
| `progress.md`       | Flattened snapshot of what is implemented and what remains (developer/org-owned).                   |
| `decisions.md`      | Architecture Decision Records (ADRs) capturing fixed decisions and their rationale.                 |
