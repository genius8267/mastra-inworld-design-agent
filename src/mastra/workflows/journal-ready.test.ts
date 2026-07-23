// B2 — LibSqlJournal `#ready` poisoning fix.
//
// The schema-create promise is memoized in `#ready`. Before the fix, a
// rejected init was cached forever ("poisoned"): every later call re-threw
// the stale error and the journal never recovered from a transient failure.
// The fix attaches the reset via .catch ON the assigned chain and rethrows,
// so current awaiters (including concurrent ones) still see the rejection,
// there is no unhandled-rejection double-fire, and only SUBSEQUENT calls
// retry. These tests drive that contract through an injected fake client.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "@libsql/client";
import { LibSqlJournal } from "./journal";

/** Fake libsql client: the schema CREATE (string sql) fails `failures` times,
 *  then succeeds; row queries succeed and return no rows. */
const fakeClient = (failures: number) => {
  const state = { schemaAttempts: 0 };
  const client = {
    async execute(q: unknown) {
      if (typeof q === "string") {
        state.schemaAttempts += 1;
        if (state.schemaAttempts <= failures) {
          throw new Error(`init boom #${state.schemaAttempts}`);
        }
      }
      return { rows: [] };
    },
    close() {},
  } as unknown as Client;
  return { client, state };
};

describe("LibSqlJournal: rejection-safe #ready memoization (B2)", () => {
  it("first call rejects on failing init; next call retries and succeeds", async () => {
    const { client, state } = fakeClient(1);
    const j = new LibSqlJournal("file:unused-injected", client);
    await assert.rejects(j.get("run", "step"), /init boom #1/);
    // Not poisoned: the retry re-runs the schema create and succeeds.
    assert.equal(await j.get("run", "step"), undefined);
    assert.equal(state.schemaAttempts, 2);
  });

  it("two concurrent callers during failing init both reject — one attempt, no hang", async () => {
    const { client, state } = fakeClient(1);
    const j = new LibSqlJournal("file:unused-injected", client);
    const [a, b] = await Promise.allSettled([j.get("r", "a"), j.get("r", "b")]);
    assert.equal(a.status, "rejected");
    assert.equal(b.status, "rejected");
    assert.match(String((a as PromiseRejectedResult).reason), /init boom #1/);
    assert.match(String((b as PromiseRejectedResult).reason), /init boom #1/);
    // Both awaited the SAME assigned chain — exactly one schema attempt.
    assert.equal(state.schemaAttempts, 1);
    // And the journal recovered afterwards.
    assert.equal(await j.get("r", "a"), undefined);
    assert.equal(state.schemaAttempts, 2);
  });

  it("successful init stays memoized — one schema create across many ops", async () => {
    const { client, state } = fakeClient(0);
    const j = new LibSqlJournal("file:unused-injected", client);
    await j.get("r", "s");
    await j.list("r");
    await j.put({
      runId: "r",
      stepId: "s",
      status: "completed",
      result: "1",
      error: null,
      attempt: 1,
      updatedAt: Date.now(),
    });
    assert.equal(state.schemaAttempts, 1);
  });
});
