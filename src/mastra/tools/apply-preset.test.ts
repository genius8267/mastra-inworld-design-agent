import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeApplyPresetTool } from "./apply-preset";
import { createSiteState, presets } from "../state/site-state";

// apply_preset is the pristine direct-path tool: production call sites are
// zero-arg and the Q2 durable-executor routing lives in realtime-lane's
// designer-level wrapper (the single ratified consumption path). These assert
// the direct path — the store mutates and the tool returns the post-mutation
// snapshot. The tool wrapper validates input and calls execute with the raw
// input object (probed), so we invoke it as execute({ name }).
type PresetResult = {
  name: string;
  theme: { bg: string; text: string; accent: string };
  fontFamily: string;
};
type Executable = { execute: (input: { name: string }) => Promise<PresetResult> };

const asExecutable = (tool: unknown): Executable => tool as Executable;

describe("apply_preset: direct store path (production shape)", () => {
  it("applies a palette preset and returns the post-mutation snapshot", async () => {
    const store = createSiteState();
    const tool = asExecutable(makeApplyPresetTool(store)); // zero-arg, as designer.ts calls it

    const result = await tool.execute({ name: "ocean" });

    assert.equal(result.name, "ocean");
    assert.deepEqual(result.theme, presets.ocean.theme);
    assert.equal(store.get().theme.bg, presets.ocean.theme.bg);
  });

  it("applies a preset that also sets typography", async () => {
    const store = createSiteState();
    const tool = asExecutable(makeApplyPresetTool(store));

    const result = await tool.execute({ name: "sunset" });

    assert.deepEqual(result.theme, presets.sunset.theme);
    assert.equal(result.fontFamily, presets.sunset.typography?.fontFamily);
    assert.equal(store.get().typography.fontFamily, presets.sunset.typography?.fontFamily);
  });
});
