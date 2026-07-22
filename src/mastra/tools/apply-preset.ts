import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { SiteStateStore } from "../state/site-state";
import type { StepExecutor } from "../workflows/executor";

const preset = z.enum(["default", "dark", "cream", "ocean", "sunset", "mono", "forest", "neon"]);

/**
 * apply_preset — the slice that flows through the durable executor (Q2). When an
 * `executor` is registered (realtime-lane injects it via createDesigner's
 * `deps`), each application runs as a journaled durable step and the recorded
 * entry proves the executor is actually consumed. With no executor it applies
 * directly, so the existing zero-arg call shape keeps working unchanged.
 *
 * Each invocation gets a fresh step id: applying a preset mutates the live store
 * (a non-idempotent-in-context effect), so re-applying the same preset must run
 * again rather than dedupe to a stale recorded result.
 */
export function makeApplyPresetTool(siteState: SiteStateStore, executor?: StepExecutor) {
  let seq = 0;
  return createTool({
    id: "apply_preset",
    description:
      "Apply a named visual preset (palette + sometimes font). Useful as a one-shot reskin.",
    inputSchema: z.object({
      name: preset.describe("Preset name"),
    }),
    outputSchema: z.object({
      name: preset,
      theme: z.object({ bg: z.string(), text: z.string(), accent: z.string() }),
      fontFamily: z.string(),
    }),
    execute: async (input) => {
      const apply = () => {
        const next = siteState.applyPreset(input.name);
        return { name: input.name, theme: next.theme, fontFamily: next.typography.fontFamily };
      };
      if (!executor) return apply();
      return executor.execute(`apply_preset#${seq++}:${input.name}`, apply);
    },
  });
}
