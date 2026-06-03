import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { SiteStateStore } from "../state/site-state";

const mode = z.enum(["garish", "tasteful"]);

export function makeSetDecorTool(siteState: SiteStateStore) {
  return createTool({
    id: "set_decor",
    description:
      "Switch the overall styling treatment, independent of colors and fonts. " +
      "'garish' = loud 90s look: thick borders, hard drop-shadows, WordArt headline. " +
      "'tasteful' = clean modern look: thin subtle borders, rounded corners, no hard shadows. " +
      "Use 'tasteful' when the user wants it clean, minimal, modern, or elegant; 'garish' to bring back the retro chaos.",
    inputSchema: z.object({
      mode: mode.describe("Styling treatment"),
    }),
    outputSchema: z.object({ decor: mode }),
    execute: async (input) => {
      const next = siteState.setDecor(input.mode);
      return { decor: next.decor };
    },
  });
}
