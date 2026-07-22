import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
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
const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

type SmokeFrame = {
  type?: string;
  role?: string;
  responseId?: string;
};

type SmokePhase = "ready" | "transcript" | "done" | "complete";

class SmokeSequence {
  #phase: SmokePhase = "ready";
  #responseId: string | undefined;

  observe(frame: SmokeFrame): boolean {
    if (this.#phase === "ready") {
      if (frame.type === "ready") this.#phase = "transcript";
      return false;
    }

    if (this.#phase === "transcript") {
      if (
        frame.type === "transcript" &&
        frame.role === "assistant" &&
        typeof frame.responseId === "string" &&
        frame.responseId.length > 0
      ) {
        this.#responseId = frame.responseId;
        this.#phase = "done";
      }
      return false;
    }

    if (this.#phase === "done") {
      if (frame.type === "speaking.done" && frame.responseId === this.#responseId) {
        this.#phase = "complete";
        return true;
      }
      return false;
    }

    return true;
  }

  get complete(): boolean {
    return this.#phase === "complete";
  }
}

async function getEphemeralPort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("failed to allocate an ephemeral TCP port");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  return address.port;
}

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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

test("WS smoke sequence ignores speaking.done before the assistant transcript", () => {
  const sequence = new SmokeSequence();
  assert.equal(sequence.observe({ type: "speaking.done", responseId: "r1" }), false);
  assert.equal(sequence.observe({ type: "ready" }), false);
  assert.equal(
    sequence.observe({ type: "transcript", role: "assistant", responseId: "r1" }),
    false,
  );
  assert.equal(sequence.complete, false);
  assert.equal(sequence.observe({ type: "speaking.done", responseId: "r1" }), true);
});

test("WS smoke sequence requires transcript and completion response IDs to match", () => {
  const sequence = new SmokeSequence();
  sequence.observe({ type: "ready" });
  sequence.observe({ type: "transcript", role: "assistant", responseId: "r1" });
  assert.equal(sequence.observe({ type: "speaking.done", responseId: "r2" }), false);
  assert.equal(sequence.complete, false);
  assert.equal(sequence.observe({ type: "speaking.done", responseId: "r1" }), true);
});

test(
  "WS smoke: /api/voice reaches ready -> transcript -> speaking.done",
  { timeout: 60_000 },
  async (t) => {
    if (!process.env.INWORLD_API_KEY) {
      console.log(SKIP_LINE);
      t.skip("no INWORLD_API_KEY");
      return;
    }

    const port = await getEphemeralPort();
    // Boot the real server as a subprocess. ADMIN_* stays unset so Studio never
    // starts; the server owns only the allocated ephemeral port.
    const child = spawn(process.execPath, ["--import", "tsx", path.join("src", "index.ts")], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        ADMIN_USERNAME: "",
        ADMIN_PASSWORD: "",
      },
      stdio: ["ignore", "pipe", "inherit"],
    });

    const childReady = new Promise<void>((resolve, reject) => {
      const guard = setTimeout(
        () => reject(new Error("spawned server did not report readiness in time")),
        20_000,
      );
      let stdout = "";
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
        if (stdout.includes(`design-agent server on http://localhost:${port}`)) {
          clearTimeout(guard);
          resolve();
        }
      });
    });
    let stopping = false;
    const childFailure = new Promise<never>((_, reject) => {
      child.once("error", (err) => reject(new Error(`server process error: ${err.message}`)));
      child.once("exit", (code, signal) => {
        if (!stopping) {
          reject(new Error(`server exited early (code=${String(code)}, signal=${String(signal)})`));
        }
      });
    });
    const seen = new Set<string>();
    const sequence = new SmokeSequence();

    try {
      await Promise.race([childReady, childFailure]);
      await Promise.race([
        waitForState(`http://127.0.0.1:${port}/api/state`, 20_000),
        childFailure,
      ]);

      await Promise.race([
        new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(`ws://127.0.0.1:${port}/api/voice`);
          let settled = false;
          const done = (err?: Error) => {
            if (settled) return;
            settled = true;
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
            let msg: SmokeFrame;
            try {
              msg = JSON.parse(ev.data) as SmokeFrame;
            } catch {
              return;
            }
            if (!msg.type) return;
            seen.add(msg.type);
            if (msg.type === "error") {
              clearTimeout(guard);
              done(new Error(`server sent error frame: ${ev.data}`));
              return;
            }
            if (sequence.observe(msg)) {
              clearTimeout(guard);
              done();
            }
          });
          ws.addEventListener("error", (ev) => {
            clearTimeout(guard);
            done(new Error(`ws error: ${String((ev as { message?: string }).message ?? ev)}`));
          });
        }),
        childFailure,
      ]);

      assert.equal(sequence.complete, true, "server should complete one ordered response");
    } finally {
      stopping = true;
      child.kill("SIGTERM");
    }
  },
);
