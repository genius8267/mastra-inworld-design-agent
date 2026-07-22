// executor.ts — durable step executor (engine-lane).
//
// Runs an effect AT MOST ONCE per (runId, stepId) against the 3-state journal
// (journal.ts). Adapted from the monorepo's DurableWorkflowClient.runStepOnce,
// simplified to this app's single-process model: no completion-race adoption
// and no "running" ledger row (Q1: the journal is absent / completed / failed).
//
// The executor is RUN-SCOPED — one instance per run (in this app, one voice
// session = one run) — so callers name only the stepId; the runId is baked in.
// Many executors can share one Journal (e.g. one LibSqlJournal across sessions),
// because the journal is keyed by (runId, stepId).

import { randomUUID } from "node:crypto";
import { InMemoryJournal, type Journal, type JournalEntry } from "./journal";

export interface StepOutcome<T> {
  /** The step's result (fresh, or decoded from a prior completed attempt). */
  result: T;
  /** true when a PRIOR completed attempt was returned and `effect` did NOT run —
   *  the at-most-once observation. */
  reused: boolean;
}

const parseResult = <T>(s: string | null): T => (s == null ? undefined : (JSON.parse(s) as T)) as T;

export class DurableExecutor {
  readonly runId: string;
  readonly #journal: Journal;

  constructor(journal: Journal = new InMemoryJournal(), runId: string = randomUUID()) {
    this.#journal = journal;
    this.runId = runId;
  }

  /**
   * Run `effect` at most once for `stepId` within this run.
   *   • journal absent    → run the effect, record completed (or failed), return { reused:false }
   *   • journal completed → return the recorded result, do NOT run effect, { reused:true }
   *   • journal failed     → throw (a terminalized step is not silently retried)
   *
   * A non-JSON-serializable result terminalizes the step as `failed` rather than
   * escaping uncaught — otherwise a retry would re-run an effect the ledger
   * believes never finished.
   */
  async runStepOnce<T>(
    stepId: string,
    effect: () => Promise<T> | T,
    attempt = 1,
  ): Promise<StepOutcome<T>> {
    const existing = await this.#journal.get(this.runId, stepId);
    if (existing?.status === "completed") {
      return { result: parseResult<T>(existing.result), reused: true };
    }
    if (existing?.status === "failed") {
      throw new Error(`step "${stepId}" already failed: ${existing.error ?? "unknown"}`);
    }

    let result: T;
    let serialized: string;
    try {
      result = await effect();
      // Serialize INSIDE the guard: a non-JSON result (cycle, BigInt) must
      // terminalize the step as failed, not throw past the ledger write.
      serialized = JSON.stringify(result);
    } catch (err) {
      await this.#journal.put({
        runId: this.runId,
        stepId,
        status: "failed",
        result: null,
        error: String((err as Error)?.message ?? err),
        attempt,
        updatedAt: Date.now(),
      });
      throw err;
    }

    await this.#journal.put({
      runId: this.runId,
      stepId,
      status: "completed",
      result: serialized,
      error: null,
      attempt,
      updatedAt: Date.now(),
    });
    return { result, reused: false };
  }

  /** This run's ledger record for `stepId` (undefined = absent). */
  getStep(stepId: string): Promise<JournalEntry | undefined> {
    return this.#journal.get(this.runId, stepId);
  }

  /** Every recorded step for this run, oldest first. */
  listSteps(): Promise<JournalEntry[]> {
    return this.#journal.list(this.runId);
  }
}

/**
 * Factory for a run-scoped executor. Realtime-lane registers one of these per
 * voice session and passes it into the designer's tools (see the apply_preset
 * slice). Defaults to an in-memory journal; pass a LibSqlJournal for durability.
 */
export function createExecutor(journal?: Journal, runId?: string): DurableExecutor {
  return new DurableExecutor(journal, runId);
}
