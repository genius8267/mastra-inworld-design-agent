# Lane Contract — mastra-inworld-design-agent (realtime-lane + engine-lane)

Ratified: ralplan v1.2 — Round 4 Critic APPROVE, 2026-07-22. Full plan: `docs/notes/ralplan-v1.2.md`.
Pre-plan baseline: `6bb85a8` (recorded as baseline ONLY — both lanes fork from THIS contract commit, not from 6bb85a8).

## Frozen seam (amendment required to touch)
- `SiteStateStore` interface in `src/mastra/state/site-state.ts` — type + method signatures (implementation belongs to engine-lane)
- HTTP contracts: `/api/state`, `/api/voice`
- Transcript/wire event shapes crossing the seam

## Ownership (file-disjoint; never edit the other lane's files)
- **realtime-lane** owns: `src/mastra/agents/designer.ts`, `src/mastra/resolve-instructions.ts`, `src/llm/voice.ts`, `src/llm/openai.ts`, `public/app.js`, `public/index.html`, `public/styles.css` (voice/WS + designer side)
- **engine-lane** owns: `src/mastra/store.ts`, `src/mastra/state/site-state.ts` (implementation, not the frozen interface shape), durable executor / journal side, `data/mastra.db` handling
- **Shared, read-only for both lanes**: `src/index.ts`, `src/admin.ts`, `package.json`, `package-lock.json` — any change requires a CONTRACT-CHANGE entry (main-only channel below)

## Amendment channel (main-only)
- Contract changes are CONTRACT-CHANGE entries appended to `docs/notes/lane-status.md` ON MAIN by the coordinator, ACKed by the other lane before merge. Never peer-to-peer.
- Lanes read protocol state via `git fetch && git show origin/main:docs/notes/lane-status.md` — always the full `docs/notes/` path (a bare `lane-status.md` read 404s silently).
- Worktree copies of `lane-status.md` are read-only for protocol purposes.

## Rulings (binding, from the ralplan record)
- **Q1** — 3-STATE journal: absent / completed / failed. A 4th state is deferred until the LibSQL journal is ratified.
- **Q2** — SHIP THE SLICE: `apply_preset` flows through the REGISTERED executor. Bypass test injects via the optional `deps?: { executor }` param on `createDesigner`; `resolve-instructions.ts:21` and `mastra/index.ts:23` keep their zero-arg-change call shape; the test asserts the journal entry, proving consumption.
- **Q3** — ENV-gated WS smoke. Hard merged-tree gate = offline boot + `/api/state` + bypass test. When `INWORLD_API_KEY` is absent the smoke MUST print the loud line: `WS smoke: SKIPPED (no INWORLD_API_KEY)`.

## Gates
- Per-lane: `tsc --noEmit` + lane tests green before any lane merge.
- Merged-tree (hard): offline boot + `/api/state` + bypass test.
- engine-lane first commit: `npx tsx --test` sanity; fallback `node --import tsx --test`.
