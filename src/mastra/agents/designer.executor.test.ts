import { test } from "node:test";
import assert from "node:assert/strict";
import { createDesigner, type StepExecutor } from "./designer";
import { createSiteState } from "../state/site-state";

/**
 * Q2 bypass test — proves `apply_preset` is CONSUMED through the injected
 * durable executor, not just wired. We inject a fake executor via the
 * `deps.executor` seam, pull the `apply_preset` tool AS REGISTERED on the
 * agent (`listTools()`), execute it, and assert (a) the executor journaled
 * exactly one completed step and (b) the store actually changed through it.
 *
 * Offline: no INWORLD_API_KEY needed. `createVoice()` returns null without a
 * key, so the agent builds with no voice; the model factory is never called.
 */

type JournalEntry = { step: string; status: "completed" | "failed" };

/** The apply_preset tool's declared output shape (its `execute` return type is
 *  a broad `void | ValidationError | {...}` union; a valid call yields this). */
type PresetResult = {
  name: string;
  theme: { bg: string; text: string; accent: string };
  fontFamily: string;
};

/** A minimal stand-in for engine-lane's durable executor: runs the step,
 *  records a completed/failed journal entry (Q1's 3-state journal; "absent"
 *  is simply the lack of an entry), and returns the step's result. */
function makeFakeExecutor() {
  const journal: JournalEntry[] = [];
  const completed = new Map<string, unknown>();
  const executor: StepExecutor = {
    async execute<T>(step: string, run: () => T | Promise<T>): Promise<T> {
      if (completed.has(step)) return completed.get(step) as T;
      try {
        const result = await run();
        completed.set(step, result);
        journal.push({ step, status: "completed" });
        return result;
      } catch (err) {
        journal.push({ step, status: "failed" });
        throw err;
      }
    },
  };
  return { executor, journal };
}

test("apply_preset flows through the registered executor and journals one completed step", async () => {
  const siteState = createSiteState();
  const { executor, journal } = makeFakeExecutor();
  const agent = createDesigner(siteState, undefined, { executor });

  const tools = await agent.listTools();
  const applyPreset = tools.apply_preset;
  assert.ok(applyPreset?.execute, "apply_preset must be registered on the agent");

  const bgBefore = siteState.get().theme.bg;
  const result = (await applyPreset.execute({ name: "dark" }, {
    agent: { toolCallId: "call-dark-1" },
  } as never)) as PresetResult;

  // (a) consumption proof: exactly one invocation-keyed completed step — the
  //     executor actually ran the mutation.
  assert.equal(journal.length, 1, "executor should journal exactly one step");
  assert.equal(journal[0].step, "apply_preset:call-dark-1");
  assert.equal(journal[0].status, "completed");

  // (b) effect proof: the store changed THROUGH the executor path, and the
  //     tool returned the post-mutation snapshot.
  assert.equal(siteState.get().theme.bg, "#0b0b0f");
  assert.notEqual(siteState.get().theme.bg, bgBefore);
  assert.equal(result.name, "dark");
  assert.equal(result.theme.bg, "#0b0b0f");
});

test("repeated preset names use distinct tool-call keys and apply every invocation", async () => {
  const siteState = createSiteState();
  const { executor, journal } = makeFakeExecutor();
  const agent = createDesigner(siteState, undefined, { executor });
  const applyPreset = (await agent.listTools()).apply_preset;
  const executeTool = applyPreset?.execute;
  assert.ok(executeTool, "apply_preset must be registered on the agent");

  const execute = async (name: "dark" | "ocean", toolCallId: string) =>
    (await executeTool({ name }, { agent: { toolCallId } } as never)) as PresetResult;

  await execute("dark", "call-1");
  await execute("ocean", "call-2");
  const result = await execute("dark", "call-3");

  assert.deepEqual(
    journal.map((entry) => entry.step),
    ["apply_preset:call-1", "apply_preset:call-2", "apply_preset:call-3"],
  );
  assert.equal(siteState.get().theme.bg, "#0b0b0f");
  assert.equal(result.theme.bg, "#0b0b0f");
});

test("without an injected executor, apply_preset stays on the direct store path (production shape)", async () => {
  const siteState = createSiteState();
  // Zero-arg-change production call shape: no deps, no executor.
  const agent = createDesigner(siteState);

  const tools = await agent.listTools();
  const applyPreset = tools.apply_preset;
  assert.ok(applyPreset?.execute, "apply_preset must be registered on the agent");

  const result = (await applyPreset.execute({ name: "ocean" }, {} as never)) as PresetResult;

  assert.equal(result.theme.bg, "#0a1f3d");
  assert.equal(siteState.get().theme.bg, "#0a1f3d");
});
