import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DurableExecutor, type StepExecutor } from "./executor";
import { InMemoryJournal } from "./journal";

describe("executor: StepExecutor seam (CC-1)", () => {
  it("DurableExecutor is structurally assignable to StepExecutor", () => {
    // Compile-time guard: if the seam shape drifts, this assignment fails tsc.
    const seam: StepExecutor = new DurableExecutor(new InMemoryJournal(), "cc1");
    assert.equal(typeof seam.execute, "function");
  });

  it("execute() runs at most once and returns the plain result (not the outcome)", async () => {
    const seam: StepExecutor = new DurableExecutor(new InMemoryJournal(), "cc1-run");
    let calls = 0;
    const run = () => {
      calls += 1;
      return { v: calls };
    };
    const first = await seam.execute("s", run);
    const second = await seam.execute("s", run);
    assert.deepEqual(first, { v: 1 });
    assert.deepEqual(second, { v: 1 }); // reused recorded result
    assert.equal(calls, 1); // at-most-once preserved through the seam
  });

  it("execute() journals completed/failed just like runStepOnce", async () => {
    const journal = new InMemoryJournal();
    const executor = new DurableExecutor(journal, "cc1-journal");
    await executor.execute("ok", () => 1);
    await executor
      .execute("bad", () => {
        throw new Error("boom");
      })
      .catch(() => {});
    const statuses = journal.all().map((e) => e.status);
    assert.deepEqual(statuses.sort(), ["completed", "failed"]);
  });
});

describe("executor: at-most-once step", () => {
  it("runs the effect once and records a completed journal entry", async () => {
    const journal = new InMemoryJournal();
    const executor = new DurableExecutor(journal, "run-1");

    let calls = 0;
    const outcome = await executor.runStepOnce("s1", () => {
      calls += 1;
      return { value: 42 };
    });

    assert.equal(calls, 1);
    assert.equal(outcome.reused, false);
    assert.deepEqual(outcome.result, { value: 42 });

    const entry = await executor.getStep("s1");
    assert.equal(entry?.status, "completed");
    assert.equal(entry?.result, JSON.stringify({ value: 42 }));
  });

  it("reuses the recorded result on replay — effect does NOT run again", async () => {
    const executor = new DurableExecutor(new InMemoryJournal(), "run-2");

    let calls = 0;
    const effect = () => {
      calls += 1;
      return calls; // would return 2 if it ran twice
    };

    const first = await executor.runStepOnce("s1", effect);
    const second = await executor.runStepOnce("s1", effect);

    assert.deepEqual([first.reused, second.reused], [false, true]);
    assert.equal(calls, 1); // proves at-most-once
    assert.equal(second.result, 1); // the recorded value, not a re-run
  });

  it("keeps distinct step ids independent within a run", async () => {
    const executor = new DurableExecutor(new InMemoryJournal(), "run-3");
    const a = await executor.runStepOnce("a", () => "A");
    const b = await executor.runStepOnce("b", () => "B");
    assert.deepEqual([a.result, b.result], ["A", "B"]);
    assert.deepEqual([a.reused, b.reused], [false, false]);
  });
});

describe("executor: 3-state journal (absent / completed / failed)", () => {
  it("absent — getStep returns undefined for an unrun step", async () => {
    const executor = new DurableExecutor(new InMemoryJournal(), "run-4");
    assert.equal(await executor.getStep("never"), undefined);
  });

  it("failed — a throwing effect records a failed entry and rethrows", async () => {
    const executor = new DurableExecutor(new InMemoryJournal(), "run-5");
    await assert.rejects(
      () =>
        executor.runStepOnce("boom", () => {
          throw new Error("kaboom");
        }),
      /kaboom/,
    );
    const entry = await executor.getStep("boom");
    assert.equal(entry?.status, "failed");
    assert.match(entry?.error ?? "", /kaboom/);
    assert.equal(entry?.result, null);
  });

  it("failed — replaying a failed step throws and does NOT re-run the effect", async () => {
    const executor = new DurableExecutor(new InMemoryJournal(), "run-6");
    let calls = 0;
    const effect = () => {
      calls += 1;
      throw new Error("nope");
    };
    await assert.rejects(() => executor.runStepOnce("s", effect), /nope/);
    await assert.rejects(() => executor.runStepOnce("s", effect), /already failed/);
    assert.equal(calls, 1);
  });

  it("failed — a non-serializable result terminalizes as failed, not as a stuck step", async () => {
    const executor = new DurableExecutor(new InMemoryJournal(), "run-7");
    await assert.rejects(() =>
      executor.runStepOnce("bad", () => ({ n: 1n }) as unknown as { n: number }),
    );
    const entry = await executor.getStep("bad");
    assert.equal(entry?.status, "failed");
  });

  it("the journal never persists a 'running' state — only completed or failed", async () => {
    const journal = new InMemoryJournal();
    const executor = new DurableExecutor(journal, "run-8");
    await executor.runStepOnce("ok", () => 1);
    await executor
      .runStepOnce("err", () => {
        throw new Error("x");
      })
      .catch(() => {});
    const statuses = journal.all().map((e) => e.status);
    assert.deepEqual(statuses.sort(), ["completed", "failed"]);
  });
});
