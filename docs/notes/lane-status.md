# Lane Status — protocol ledger (main-only writes)

Append-only. Entry kinds: `STATUS`, `CONTRACT-CHANGE`, `ACK`.
Lanes read this file via `git fetch && git show origin/main:docs/notes/lane-status.md` — never a bare path, never the worktree copy (worktree copies are read-only for protocol purposes).
Only the coordinator writes here, on main.

## Entries

- `STATUS 2026-07-22` PHASE-0: contract commit created (lane-contract.md + lane-status.md + ralplan-v1.2.md on main). Pre-plan baseline `6bb85a8`; lane fork point = this commit. Lanes not yet started.
