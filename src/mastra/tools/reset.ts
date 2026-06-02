import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { SiteStateStore } from "../state/site-state";

export function makeResetTool(siteState: SiteStateStore) {
  return createTool({
    id: "reset",
    description: "Restore the page to its default state (theme, type, copy, layout).",
    inputSchema: z.object({}),
    outputSchema: z.object({ ok: z.literal(true) }),
    execute: async () => {
      siteState.reset();
      return { ok: true as const };
    },
  });
}
