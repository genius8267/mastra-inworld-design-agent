import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeApplyPresetTool } from "./apply-preset";
import { createSiteState, presets } from "../state/site-state";
import { DurableExecutor } from "../workflows/executor";
import { InMemoryJournal } from "../workflows/journal";

// Q2 slice: apply_preset flows through the REGISTERED executor, and the journal
// entry proves consumption. The tool wrapper validates its input and calls our
// execute with the raw input object (probed), so we invoke it as execute({name}).
type PresetResult = {
  name: string;
  theme: { bg: string; text: string; accent: string };
  fontFamily: string;
};
type Executable = { execute: (input: { name: string }) => Promise<PresetResult> };

const asExecutable = (tool: unknown): Executable => tool as Executable;

describe("apply_preset slice: flows through the registered executor", () => {
  it("records a completed journal entry — proving the executor is consumed", async () => {
    const store = createSiteState();
    const executor = new DurableExecutor(new InMemoryJournal(), "session-1");
    const tool = asExecutable(makeApplyPresetTool(store, executor));

    const result = await tool.execute({ name: "sunset" });

    // The visual change actually landed.
    assert.deepEqual(result.theme, presets.sunset.theme);
    assert.equal(store.get().theme.bg, presets.sunset.theme.bg);

    // ...and it went THROUGH the executor: exactly one journaled step.
    const steps = await executor.listSteps();
    assert.equal(steps.length, 1);
    assert.equal(steps[0].status, "completed");
    assert.match(steps[0].stepId, /^apply_preset/);
    assert.equal(steps[0].result, JSON.stringify(result));
  });

  it("each application is its own durable step — live re-apply is not deduped", async () => {
    const store = createSiteState();
    const executor = new DurableExecutor(new InMemoryJournal(), "session-2");
    const tool = asExecutable(makeApplyPresetTool(store, executor));

    await tool.execute({ name: "dark" });
    await tool.execute({ name: "cream" });
    await tool.execute({ name: "dark" }); // same preset again → must run again

    const steps = await executor.listSteps();
    assert.equal(steps.length, 3);
    assert.ok(steps.every((s) => s.status === "completed"));
    // Distinct step ids so nothing is silently reused.
    assert.equal(new Set(steps.map((s) => s.stepId)).size, 3);
    // Store reflects the last application.
    assert.equal(store.get().theme.bg, presets.dark.theme.bg);
  });

  it("without an executor, applies directly and keeps the zero-arg call shape", async () => {
    const store = createSiteState();
    const tool = asExecutable(makeApplyPresetTool(store)); // one-arg, as designer.ts calls it

    const result = await tool.execute({ name: "ocean" });

    assert.deepEqual(result.theme, presets.ocean.theme);
    assert.equal(store.get().theme.bg, presets.ocean.theme.bg);
  });
});
