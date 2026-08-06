# Memory Bank

This directory is the shared coordination memory for all agents working on the AwesomeADO project.

## Protocol

- **All agents read `README.md`, `projectbrief.md`, and `activeContext.md` before starting a task.**
  Use this index and targeted search to load only the other sections relevant to the task. Never
  eagerly read the complete ADR or debugging history.
- **Parallel workers NEVER edit shared memory files.** Return a concise `Memory-bank delta`
  section in your §4.1 response instead (see AGENTS.md for the exact format).
- **The serial coordinator applies deltas once at the final barrier.** After all implementation
  waves stabilize, one coordinator merges their deltas into `activeContext.md`, `progress.md`, and
  `decisions.md` immediately before final verification.
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
| `decisions.md`      | Searchable ADR history; load only the decisions relevant to the current task.                       |
| `debuggingNotes.md` | Searchable lab notebook; load only matching root causes, gotchas, or recipes.                       |

## Where durable knowledge lives

**Record durable repo knowledge here, in source control — never in an agent-tool-local memory
(Copilot/Claude/Codex per-machine memory).** Tool-local memory does not clone or transfer between
machines, agents, or teammates, so anything learned there is silently lost. Architecture and rationale
go in `systemPatterns.md`/`decisions.md`; tactical bug findings, gotchas, and debugging recipes go in
`debuggingNotes.md`. If you catch yourself about to write a lasting fact into a tool memory, write it
here instead.
