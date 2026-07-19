# Copilot instructions

All repository instructions live in [AGENTS.md](../AGENTS.md). Follow it.

Non-negotiables (see AGENTS.md for detail):

- No change is complete until `pnpm verify` passes at the serial wave barrier.
- Shared extension runtime code lives under `src/common/**`; follow SOLID; comment the "why",
  not the "what".
- Read `.agents/memory-bank/` before starting. Parallel workers return memory and changelog
  deltas; only the serial coordinator edits those shared files.
