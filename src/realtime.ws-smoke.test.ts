import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { WebSocket, fetch as undiciFetch } from "undici";

/**
 * Q3 WS smoke — ENV-gated live check of the realtime baseline.
 *
 * Without INWORLD_API_KEY it prints the ONE loud contract line and skips
 * cleanly (the hard merged-tree gate must NEVER require the key). With a key it
 * boots the real server, opens /api/voice, and asserts the already-verified
 * baseline still holds: ready -> transcript -> speaking.done, driven by the
 * auto-intro the server speaks on connect (no mic audio needed).
 */

const SKIP_LINE = "WS smoke: SKIPPED (no INWORLD_API_KEY)";
const PORT = Number(process.env.WS_SMOKE_PORT ?? 4191);
const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

async function waitForState(url: string, deadlineMs: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await undiciFetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() - start > deadlineMs) throw new Error(`server did not answer ${url} in time`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

test(
  "WS smoke: /api/voice reaches ready -> transcript -> speaking.done",
  { timeout: 60_000 },
  async (t) => {
    if (!process.env.INWORLD_API_KEY) {
      console.log(SKIP_LINE);
      t.skip("no INWORLD_API_KEY");
      return;
    }

    // Boot the real server as a subprocess. ADMIN_* stays unset so Studio never
    // starts; the server owns only $PORT.
    const child = spawn(process.execPath, ["--import", "tsx", path.join("src", "index.ts")], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        HOST: "127.0.0.1",
        ADMIN_USERNAME: "",
        ADMIN_PASSWORD: "",
      },
      stdio: ["ignore", "inherit", "inherit"],
    });

    const seen = new Set<string>();
    let sawAssistantTranscript = false;

    try {
      await waitForState(`http://127.0.0.1:${PORT}/api/state`, 20_000);

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/voice`);
        const done = (err?: Error) => {
          try {
            ws.close();
          } catch {
            /* already closing */
          }
          err ? reject(err) : resolve();
        };
        const guard = setTimeout(
          () => done(new Error(`timed out; saw: ${[...seen].join(", ") || "nothing"}`)),
          45_000,
        );

        ws.addEventListener("message", (ev) => {
          // Only text frames are control JSON; binary frames are PCM audio.
          if (typeof ev.data !== "string") return;
          let msg: { type?: string; role?: string };
          try {
            msg = JSON.parse(ev.data);
          } catch {
            return;
          }
          if (!msg.type) return;
          seen.add(msg.type);
          if (msg.type === "transcript" && msg.role === "assistant") sawAssistantTranscript = true;
          if (msg.type === "error") {
            clearTimeout(guard);
            done(new Error(`server sent error frame: ${ev.data}`));
            return;
          }
          // The auto-intro yields all three; speaking.done is the terminal signal.
          if (seen.has("ready") && sawAssistantTranscript && seen.has("speaking.done")) {
            clearTimeout(guard);
            done();
          }
        });
        ws.addEventListener("error", (ev) => {
          clearTimeout(guard);
          done(new Error(`ws error: ${String((ev as { message?: string }).message ?? ev)}`));
        });
      });

      assert.ok(seen.has("ready"), "server should send a ready frame");
      assert.ok(sawAssistantTranscript, "server should stream an assistant transcript");
      assert.ok(seen.has("speaking.done"), "server should finish a spoken response");
    } finally {
      child.kill("SIGTERM");
    }
  },
);
