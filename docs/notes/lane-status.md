# Lane Status — protocol ledger (main-only writes)

Append-only. Entry kinds: `STATUS`, `CONTRACT-CHANGE`, `ACK`.
Lanes read this file via `git fetch && git show origin/main:docs/notes/lane-status.md` — never a bare path, never the worktree copy (worktree copies are read-only for protocol purposes).
Only the coordinator writes here, on main.

## Entries

- `STATUS 2026-07-22` PHASE-0: contract commit created (lane-contract.md + lane-status.md + ralplan-v1.2.md on main). Pre-plan baseline `6bb85a8`; lane fork point = this commit. Lanes not yet started.

- `CONTRACT-CHANGE 2026-07-22 CC-1` (proposed by realtime-lane, entered by coordinator): the executor seam is ratified as the consumer-side interface defined in `src/mastra/agents/designer.ts`:
  `export interface StepExecutor { execute<T>(step: string, run: () => T | Promise<T>): Promise<T> }`
  engine-lane's registered durable executor MUST be structurally assignable to this shape, journaling completed/failed per Q1 (3-state). Method name `execute`, async, `(step: string, run)` order — no required journal-accessor on the injected type. Awaiting ACK from engine-lane.
- `STATUS 2026-07-22` realtime-lane complete at `53918c7` (2 commits off 87db3a8): Q2 slice + bypass test green, Q3 WS smoke ENV-gated with loud skip line. Prod call sites remain zero-arg direct-path per Q2 SHIP THE SLICE; prod executor injection is explicitly OUT OF SCOPE for wave 1 (coordinator decision deferred to integration).
- `ACK 2026-07-22 CC-1` engine-lane accepts the `StepExecutor.execute(step, run)` seam. Structural assignment and replay tests are green; implementation landed at `1be47ab` and the final engine-lane tip is `a005259`.
- `STATUS 2026-07-22` engine-lane handoff: store/tools seam unchanged; pure scheduler, run-scoped executor, 3-state journal, and in-memory + LibSQL transports are stable at `a005259`.
- `STATUS 2026-07-22` integration rulings: production call sites intentionally remain on the direct, non-executor path for this slice; executor injection remains deferred. LibSQL persistence ratifies the existing absent/completed/failed journal only — no persisted `running` state or crash-proof exactly-once claim is added.
- `STATUS 2026-07-22` local integration closed at merge `a2613e4`: typecheck and format pass; 43 tests = 42 passed, 0 failed, 1 explicit ENV-gated skip; child-bound `PORT=0` boot and exact `/api/state` contract pass. Independent verifier verdict: PASS, zero blockers; all seven GPT review/delta findings have passing regression coverage.
- `STATUS 2026-07-22` terminal boundary: the keyed live Inworld WebSocket smoke remains unexecuted and is recorded as skipped, not passing. No credential was accessed or copied; no push, PR, or deployment occurred.
