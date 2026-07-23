// B3 — the journal write must not mask effect errors.
//
// In the failed-step path the executor journals `failed` BEFORE rethrowing.
// If that put itself rejects (E2), the caller must still receive the effect
// error E1 — E2 is logged and attached as `journalError`, never substituted.

import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { DurableExecutor } from "./executor";
import { InMemoryJournal } from "./journal";
import type { JournalEntry } from "./journal";

class FailingPutJournal extends InMemoryJournal {
  readonly putError: Error;
  constructor(putError: Error) {
    super();
    this.putError = putError;
  }
  override async put(_entry: JournalEntry): Promise<void> {
    throw this.putError;
  }
}

describe("executor: journal write must not mask effect errors (B3)", () => {
  it("effect throws E1, put throws E2 → surfaced error is E1 with E2 attached", async () => {
    const e1 = new Error("effect exploded (E1)");
    const e2 = new Error("journal down (E2)");
    const executor = new DurableExecutor(new FailingPutJournal(e2), "b3-run");
    const logged = mock.method(console, "error", () => {});
    try {
      await assert.rejects(
        executor.execute("boom", () => {
          throw e1;
        }),
        (err: unknown) => {
          assert.equal(err, e1); // exact identity — E1, not E2, not a wrapper
          assert.equal((err as Error & { journalError?: unknown }).journalError, e2);
          return true;
        },
      );
      // E2 is recorded: exactly one loud log naming the step, carrying E2.
      assert.equal(logged.mock.callCount(), 1);
      const args = logged.mock.calls[0].arguments;
      assert.match(String(args[0]), /journal write failed while terminalizing step "boom"/);
      assert.equal(args[1], e2);
    } finally {
      logged.mock.restore();
    }
  });

  it("happy path unchanged: working journal still records failed and rethrows E1", async () => {
    const journal = new InMemoryJournal();
    const executor = new DurableExecutor(journal, "b3-happy");
    const e1 = new Error("plain failure");
    await assert.rejects(
      executor.execute("step", () => {
        throw e1;
      }),
      (err: unknown) => err === e1,
    );
    const entry = await executor.getStep("step");
    assert.equal(entry?.status, "failed");
    assert.equal(entry?.error, "plain failure");
    assert.equal((e1 as Error & { journalError?: unknown }).journalError, undefined);
  });
});
