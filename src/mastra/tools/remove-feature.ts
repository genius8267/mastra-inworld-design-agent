import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { SiteStateStore } from "../state/site-state";

export function makeRemoveFeatureTool(siteState: SiteStateStore) {
  return createTool({
    id: "remove_feature",
    description: "Remove the feature card at the given 0-based index.",
    inputSchema: z.object({
      index: z.number().int().min(0).describe("0-based index of the feature to remove"),
    }),
    outputSchema: z.object({ index: z.number().int(), count: z.number().int() }),
    execute: async (input) => {
      const next = siteState.removeFeature(input.index);
      return { index: input.index, count: next.features.length };
    },
  });
}
