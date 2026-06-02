import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { SiteStateStore } from "../state/site-state";

export function makeSetMarqueeTool(siteState: SiteStateStore) {
  return createTool({
    id: "set_marquee",
    description:
      "Set the scrolling marquee text at the bottom of the page. Pass an empty string to hide the marquee.",
    inputSchema: z.object({
      text: z.string().describe("Marquee text. Empty string hides it."),
    }),
    outputSchema: z.object({ text: z.string() }),
    execute: async (input) => {
      siteState.setMarquee(input.text);
      return { text: input.text };
    },
  });
}
