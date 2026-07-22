# Multi-Lane Build Plan — mastra-inworld-design-agent (realtime-lane + engine-lane)

**Ralplan v1.2 (Round 4 — Architect R2 amendments + Critic REVISE changes 1–3 applied) · repo: `~/code/mastra-inworld-design-agent` · pre-plan baseline recorded at `6bb85a8` · READ-ONLY inspection performed, nothing modified**

---

## 1. RALPLAN-DR Summary

### Principles
1. **One repo, one contract** — lanes coordinate through a frozen interface (the `SiteStateStore` seam and the `/api/voice` wire protocol), not through shared file edits.
2. **Ground in what exists** — engine-lane adapts patterns already proven in `intunelabs-monorepo/services/mastra/src/mastra/workflows/` (`durable-engine.ts`, `control-flow.ts`); it does not invent a new engine design.
3. **Offline-testable engine, live-gated realtime** — mirrors the monorepo split: pure/deterministic logic gets unit-style verification; voice/WS gets a live smoke check (`ready` → transcript → `speaking.done`).
4. **Non-overlapping ownership** — every tracked file has exactly one owning lane; cross-lane needs go through the contract doc, never direct edits.
5. **Verified state is spent, not re-earned** — INWORLD end-to-end is already proven; realtime-lane must not burn time re-verifying the boot/WS baseline.

### Decision Drivers (top 3)
1. **Repo size**: core surface is small (~550 lines across `src/index.ts`, `site-state.ts`, `designer.ts`, `admin.ts`, `llm/`). Planning overhead must stay proportional.
2. **Single seam**: the lanes touch at exactly one boundary (`SiteStateStore` + tools consumed by the designer agent). Low inter-lane surface → low need for independent consensus loops.
3. **Consensus cost**: each ralplan is a Planner→Architect→Critic loop (~3+ agent rounds). Two extra loops for a two-lane build in a small repo is real cost with little added safety.

### Answer to the user's explicit question ("Do we need a different /ralplan for each lane?"): **No — one unified ralplan (Option A). This document is it.**

| Option | Pros | Cons |
|---|---|---|
| **A. One unified plan, per-lane sections** ✅ | Single source of truth for the contract; merge order and file ownership decided once, globally; cheapest; the seam is visible in one place | Plan doc slightly longer; lane agents read sections that aren't theirs |
| B. Separate ralplan per lane | Maximum lane autonomy; deep per-lane detail | Contract drift — two consensus loops can approve incompatible views of the `SiteStateStore` seam; ~3× coordination cost; nobody owns merge order. **Invalidated**: the whole point of this build is the shared seam, which per-lane loops structurally cannot arbitrate. |
| C. Hybrid: umbrella plan + per-lane specs | Scales to 3+ lanes or long-lived lanes | Redundant here: the two `docs/notes/` files (below) *are* the lightweight per-lane specs, so C collapses into A at this scale. Revisit only if a third lane or multi-week lanes appear. |

---

## 2. The Plan

### Lane definitions (grounded in files actually read)

**realtime-lane** — the live transport/session surface:
- `src/index.ts` — Hono server on `:4111`, `/api/state`, `/api/voice` WS (PCM16 mono @ 24kHz; control messages `ready`/`transcript`/`state`/`tool`/`interrupted`/`speaking.done`/`error`), per-connection `VoiceSession` with barge-in `cancelled` set and voice-reconnect (`voice: InworldVoice | null`)
- `src/llm/voice.ts`, `src/llm/openai.ts` — Inworld realtime voice + LLM wiring
- `src/mastra/agents/designer.ts` — agent assembly (owned here because it wires tools + `getVoice`)
- `src/admin.ts` — Studio proxy/upgrade (stays disabled; `ADMIN_*` unset)
- `public/app.js`, `public/index.html`, `public/styles.css` — client audio/UI
- Work: session-lifecycle hardening (reconnect, barge-in drain, error frames), preserving the demo-stability net in `index.ts`.

**engine-lane** — the deterministic state/tool/workflow layer (no realtime deps):
- `src/mastra/state/site-state.ts` — `SiteStateStore` (`createSiteState`, `defaults`); the contract seam
- `src/mastra/tools/*.ts` — all 11 tools (`set-theme`, `set-copy`, `set-layout`, `apply-preset`, `add/update/remove-feature`, `set-marquee`, `set-typography`, `set-decor`, `reset`)
- `src/mastra/store.ts`, `src/mastra/resolve-instructions.ts`
- **New** `src/mastra/workflows/` — port the monorepo pattern: a pure control-flow scheduler (per `control-flow.ts`: `ScheduleNode`s with `deps`/`enabledWhen` deciding what runs next) and a durable-step executor with **injectable transport** (per `durable-engine.ts`), backed here by in-memory + `@mastra/libsql` (`data/mastra.db`) instead of Convex. Fully offline-tested, mirroring the monorepo's "pure decisions tested offline, execution live-gated" split.

### Phase 0 (concrete)
1. Two worktrees off the **Phase-0 contract commit (the new `main` tip created in step 4)** — NOT off `6bb85a8`; `6bb85a8` is recorded only as the pre-plan baseline. This guarantees `lane-contract.md`/`lane-status.md` exist inside both lanes from their first commit:
   - `git worktree add ../mastra-inworld-design-agent--realtime -b lane/realtime`
   - `git worktree add ../mastra-inworld-design-agent--engine -b lane/engine`
   - Copy `.env` into each worktree (gitignored; worktrees don't share it).
2. `docs/notes/lane-contract.md` (frozen at Phase 0; changes need both lanes' ack): file-ownership map; `SiteStateStore` public interface snapshot; `/api/voice` wire-protocol message list; the tool-registration signature `designer.ts` consumes.
3. `docs/notes/lane-status.md` (append-only): per-lane entries `date / lane / done / blocked-on / next`; handoff requests; contract-change proposals. **Amendment-channel rule (main-only):** all CONTRACT-CHANGE and ACK entries are committed directly to `main`'s `lane-status.md` (by the coordinator, or via direct single-file commits to main). Lanes read live protocol state via `git fetch && git show origin/main:lane-status.md` (or `main:docs/notes/lane-status.md` for the local remote-less flow); worktree copies of `lane-status.md` are **read-only for protocol purposes**. Ordinary per-lane status appends may stay in-branch, but contract-change traffic must be main-only — this rule is also stated in `lane-contract.md`.
4. Commit both docs to `main` **before** creating the worktrees (so both lanes inherit them) — this Phase-0 contract commit is the worktree base from step 1. Coordinator pre-step: resolve the currently uncommitted `M package-lock.json` on main (commit or discard) so Phase 0 starts from a clean tree. Then spawn the two lane agents.

### Per-lane acceptance & verification (exact commands, run in each worktree)
- Both lanes: `npm run typecheck` (tsc --noEmit) and `npm run format:check` — clean (lint CI is `.github/workflows/lint.yml`).
- engine-lane: no `test` script exists in `package.json`; use node:test via `tsx --test src/**/*.test.ts` (no new deps). Acceptance = scheduler decisions (deps, branch `enabledWhen`, loop continuation) and at-most-once step reuse (`reused: true` on replay) covered offline.
- realtime-lane: `npm run dev`, then `curl -s localhost:4111/api/state` returns defaults JSON; WS smoke = connect `/api/voice`, receive `{type:"ready"}`, stream mic PCM, observe `transcript` → `speaking.done` (already-verified baseline must still hold post-change).

### Coordination
- **Merge order: engine-lane → main → realtime-lane rebases → main.** Realtime consumes the store/tools; engine consumes nothing from realtime.
- Shared-file ownership: `package.json`/`package-lock.json` and `docs/notes/*` are **main-only** (lanes propose via `lane-status.md`; coordinator applies on main). `designer.ts` is realtime-owned; engine-lane requests tool-registration changes via the contract doc.
- Handoff trigger: engine-lane posts "store/tools stable @ <sha>" in `lane-status.md`, unblocking realtime-lane's final integration pass.

### Out of scope
Deploys (`render.yaml`); enabling `/admin` Studio; Convex transport; monorepo changes (read-only reference); new npm dependencies; client visual redesign; CI changes beyond keeping lint green.

---

## 3. Top 3 Risks & Mitigations

1. **"engine-lane" scope ambiguity** — the design agent has zero existing workflow/engine code (grep of `src/` confirms); the definition above is inferred from the monorepo's `durable-engine.ts`/`control-flow.ts`. *Mitigation*: Architect/Critic must explicitly ratify or amend the engine-lane deliverable in round 2; engine-lane starts with the pure scheduler (lowest-regret piece) either way.
2. **Seam drift at `designer.ts`/`site-state.ts`** — engine changes to store/tool shapes silently break the agent wiring realtime-lane builds on. *Mitigation*: interface snapshot frozen in `lane-contract.md`; `npm run typecheck` on the *rebased* realtime branch is the merge gate; contract changes require a logged two-lane ack.
3. **Alpha-version instability** (`@mastra/core 1.38.0-alpha.5`, `@mastra/voice-inworld 0.3.0-alpha.1`) — engine-lane may hit missing/renamed builder APIs. *Mitigation*: lockfile frozen (`package.json` main-only); engine-lane codes against its own pure modules + injectable transport, minimizing `@mastra/core` surface, exactly as the monorepo engine does.

---
*Deliverable complete — ready for Architect review + Critic verdict. Open question flagged for round 2: ratify the engine-lane deliverable definition (Risk 1).*