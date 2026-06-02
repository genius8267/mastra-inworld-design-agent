import { mkdirSync } from "node:fs";
import path from "node:path";
import { LibSQLStore } from "@mastra/libsql";

/**
 * Shared SQLite storage — the bridge between Studio and the public demo.
 *
 * Both processes (the public server and the Studio child) open the SAME
 * database file: Studio writes instruction edits to the stored-agents tables
 * (mastra_agents / mastra_agent_versions), and the public server reads the
 * published version when it builds each voice session's agent.
 *
 * On Render, point DATABASE_URL at the persistent disk (see render.yaml) so
 * edits survive deploys.
 */
export function createSharedStorage(): LibSQLStore {
  const url = process.env.DATABASE_URL ?? "file:./data/mastra.db";
  if (url.startsWith("file:")) {
    mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
  }
  return new LibSQLStore({ id: "design-agent", url });
}
