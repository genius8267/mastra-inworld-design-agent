import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { addFeature } from "../state/site-state";

export const addFeatureTool = createTool({
  id: "add_feature",
  description:
    "Append a feature card to the page. Optionally pass a 0-based index to insert at a specific position.",
  inputSchema: z.object({
    title: z.string().min(1).describe("Short card title"),
    body: z.string().min(1).describe("One-sentence description"),
    index: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Position to insert (defaults to end)"),
  }),
  outputSchema: z.object({
    title: z.string(),
    body: z.string(),
    index: z.number().int(),
  }),
  execute: async (input) => {
    const next = addFeature({ title: input.title, body: input.body }, input.index);
    const idx =
      typeof input.index === "number"
        ? input.index
        : next.features.length - 1;
    return { title: input.title, body: input.body, index: idx };
  },
});
