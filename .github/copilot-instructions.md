# Copilot instructions

All repository instructions live in [AGENTS.md](../AGENTS.md). Follow it.

Non-negotiables (see AGENTS.md for detail):

- No change is complete until one final `pnpm verify` passes for the stable repository state; use
  focused checks during iterations and let `pre-push` reuse an identical successful gate.
- Shared extension runtime code lives under `src/common/**`; follow SOLID; comment the "why",
  not the "what".
- Read the memory-bank entry set before starting, then load only relevant indexed sections. Parallel
  workers return memory and changelog deltas; the coordinator applies them once before final verify.
