import { Mastra } from "@mastra/core/mastra";
import { MastraEditor } from "@mastra/editor";
import { createDesigner } from "./agents/designer";
import { createSiteState } from "./state/site-state";
import { createSharedStorage } from "./store";

/* Studio entrypoint, bundled by `mastra build --studio`.
 *
 * The public server (src/index.ts) never imports this — it builds a fresh
 * agent + state store per voice session. This instance exists so Mastra
 * Studio can introspect, exercise, and EDIT the designer agent at /admin.
 *
 * storage + editor enable the stored-agents flow: instruction edits saved in
 * Studio persist to the shared database (see store.ts), and the public
 * server picks up the published version for new voice sessions. The agent's
 * `editor` field is deliberately omitted — that keeps the code-defined
 * instructions as the baseline while letting Studio override them.
 *
 * apiPrefix/studioBase put ALL of Studio (UI + API) under /admin, so the
 * main server can gate and proxy a single path prefix. */

export const mastra = new Mastra({
  agents: { designer: createDesigner(createSiteState()) },
  storage: createSharedStorage(),
  editor: new MastraEditor(),
  server: {
    apiPrefix: "/admin/api",
    studioBase: "/admin",
  },
});
