import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { applyPreset } from "../state/site-state";

const preset = z.enum([
  "default",
  "dark",
  "cream",
  "ocean",
  "sunset",
  "mono",
  "forest",
  "neon",
]);

export const applyPresetTool = createTool({
  id: "apply_preset",
  description:
    "Apply a named visual preset (palette + sometimes font). Useful as a one-shot reskin.",
  inputSchema: z.object({
    name: preset.describe("Preset name"),
  }),
  outputSchema: z.object({ name: preset }),
  execute: async (input) => {
    applyPreset(input.name);
    return { name: input.name };
  },
});
