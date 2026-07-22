import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LibSqlJournal, type JournalEntry } from "./journal";
import { DurableExecutor } from "./executor";

// A real on-disk SQLite file (no network) proves the 3-state ledger survives
// beyond a single in-memory Map. Kept in the OS temp dir and removed after.
const dir = mkdtempSync(path.join(tmpdir(), "engine-lane-journal-"));
const dbUrl = `file:${path.join(dir, "journal.db")}`;
const journals: LibSqlJournal[] = [];

const open = (): LibSqlJournal => {
  const j = new LibSqlJournal(dbUrl);
  journals.push(j);
  return j;
};

after(() => {
  for (const j of journals) j.close();
  rmSync(dir, { recursive: true, force: true });
});

const entry = (over: Partial<JournalEntry>): JournalEntry => ({
  runId: "run",
  stepId: "step",
  status: "completed",
  result: null,
  error: null,
  attempt: 1,
  updatedAt: Date.now(),
  ...over,
});

describe("LibSqlJournal: durable 3-state round-trip", () => {
  it("absent — get returns undefined before anything is written", async () => {
    const j = open();
    assert.equal(await j.get("run", "missing"), undefined);
  });

  it("persists a completed entry and reads it back", async () => {
    const j = open();
    await j.put(entry({ stepId: "done", status: "completed", result: JSON.stringify({ ok: 1 }) }));
    const got = await j.get("run", "done");
    assert.equal(got?.status, "completed");
    assert.equal(got?.result, JSON.stringify({ ok: 1 }));
    assert.equal(got?.error, null);
  });

  it("persists a failed entry and reads it back", async () => {
    const j = open();
    await j.put(entry({ stepId: "boom", status: "failed", error: "kaboom" }));
    const got = await j.get("run", "boom");
    assert.equal(got?.status, "failed");
    assert.equal(got?.error, "kaboom");
    assert.equal(got?.result, null);
  });

  it("upserts on the (runId, stepId) key rather than duplicating", async () => {
    const j = open();
    await j.put(entry({ stepId: "up", status: "failed", error: "first" }));
    await j.put(entry({ stepId: "up", status: "completed", result: '"second"' }));
    const rows = (await j.list("run")).filter((e) => e.stepId === "up");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "completed");
  });

  it("survives reopening the same file — durability across a new client", async () => {
    const first = open();
    await first.put(entry({ runId: "persist", stepId: "s", result: '"kept"' }));
    const reopened = open();
    const got = await reopened.get("persist", "s");
    assert.equal(got?.result, '"kept"');
  });

  it("backs a DurableExecutor end to end (at-most-once over a real file)", async () => {
    const j = open();
    const executor = new DurableExecutor(j, "exec-run");
    let calls = 0;
    const eff = () => {
      calls += 1;
      return { n: calls };
    };
    const a = await executor.runStepOnce("s", eff);
    const b = await executor.runStepOnce("s", eff);
    assert.equal(calls, 1);
    assert.equal(a.reused, false);
    assert.equal(b.reused, true);
    assert.deepEqual(b.result, { n: 1 });
  });

  it("persists and replays a void result without rerunning the effect", async () => {
    let calls = 0;
    const first = new DurableExecutor(open(), "void-run");
    const initial = await first.execute("void", () => {
      calls += 1;
    });
    assert.equal(initial, undefined);

    const reopened = new DurableExecutor(open(), "void-run");
    const replayed = await reopened.execute("void", () => {
      calls += 1;
    });
    assert.equal(replayed, undefined);
    assert.equal(calls, 1);
  });
});
