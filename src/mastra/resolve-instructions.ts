import { Mastra } from "@mastra/core/mastra";
import { MastraEditor } from "@mastra/editor";
import { createDesigner } from "./agents/designer";
import { createSiteState } from "./state/site-state";
import { createSharedStorage } from "./store";

/* Public-server side of the Studio→live bridge.
 *
 * A minimal "reader" Mastra instance over the same shared database the
 * Studio child writes to. Per voice session, resolveDesignerInstructions()
 * returns the published instruction override saved in Studio — or undefined
 * when there's none (or storage is unavailable), in which case the caller
 * falls back to the code-defined baseline.
 *
 * clearCache before each resolve: the editor caches resolved agents, and
 * writes happen in the OTHER process, so this process's cache is never
 * invalidated by a save. Per-session resolution is cheap (one SQLite read).
 */

const reader = new Mastra({
  agents: { designer: createDesigner(createSiteState()) },
  storage: createSharedStorage(),
  editor: new MastraEditor(),
});

/* 'published' (default) = edits go live when you click Activate in Studio —
 * drafts stay sandboxed to the Studio playground, and you keep version
 * rollback. Set PUBLIC_AGENT_STATUS=draft to make every save live instantly. */
const STATUS = process.env.PUBLIC_AGENT_STATUS === "draft" ? "draft" : "published";

export async function resolveDesignerInstructions(): Promise<string | undefined> {
  try {
    reader.getEditor()?.agent.clearCache("designer");
    const agent = await reader.getAgentById("designer", { status: STATUS });
    const instructions = await agent.getInstructions();
    if (typeof instructions === "string" && instructions.trim().length > 0) {
      return instructions;
    }
    return undefined;
  } catch {
    // No stored override yet, or storage unavailable — use the code baseline.
    return undefined;
  }
}
