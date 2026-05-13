import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { updateFeature } from "../state/site-state";

export const updateFeatureTool = createTool({
  id: "update_feature",
  description: "Edit the title and/or body of an existing feature card by 0-based index.",
  inputSchema: z.object({
    index: z.number().int().min(0).describe("0-based index of the feature to edit"),
    title: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
  }),
  outputSchema: z.object({
    index: z.number().int(),
    title: z.string().optional(),
    body: z.string().optional(),
  }),
  execute: async (input) => {
    updateFeature(input.index, { title: input.title, body: input.body });
    return { index: input.index, title: input.title, body: input.body };
  },
});
