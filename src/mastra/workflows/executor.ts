// executor.ts — durable step executor (engine-lane).
//
// Coalesces an effect per (runId, stepId) within one live executor and reuses
// terminal results from the 3-state journal (journal.ts). Adapted from the
// monorepo's DurableWorkflowClient.runStepOnce, simplified to this app's
// single-process model with no persisted "running" claim (Q1: the journal is
// absent / completed / failed).
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

/**
 * The registered-executor seam consumed by the designer's tools (CONTRACT-CHANGE
 * CC-1). The injected executor need only expose this — `execute` coalesces
 * overlapping calls on one live executor and reuses a completed journal result,
 * returning the plain value while journaling completed/failed per the Q1 3-state
 * ruling. Realtime-lane declares an identical interface on its side; structural
 * typing makes DurableExecutor assignable to both. Extra members (runStepOnce,
 * getStep, listSteps, runId) are fine — not required here.
 */
export interface StepExecutor {
  execute<T>(step: string, run: () => T | Promise<T>): Promise<T>;
}

/**
 * Encoded sentinel for a legitimately-undefined (void) step result. The bare
 * token is not valid JSON, so it cannot collide with JSON.stringify output.
 * Legacy rows remain plain JSON and decode exactly as before (and a legacy null
 * result already decoded to undefined).
 */
const UNDEFINED_RESULT = "__mastra_undefined__";

const parseResult = <T>(s: string | null): T =>
  (s == null || s === UNDEFINED_RESULT ? undefined : (JSON.parse(s) as T)) as T;

/**
 * Encode a step result for the journal's TEXT column. `undefined` (a void
 * effect) becomes the sentinel so replay preserves it; any OTHER value that
 * JSON.stringify maps to undefined (function, symbol) is not representable and
 * throws — the caller terminalizes the step as failed.
 */
const encodeResult = (result: unknown): string => {
  if (result === undefined) return UNDEFINED_RESULT;
  const serialized = JSON.stringify(result);
  if (serialized === undefined) {
    throw new Error("step result is not JSON-serializable (JSON.stringify returned undefined)");
  }
  return serialized;
};

export class DurableExecutor implements StepExecutor {
  readonly runId: string;
  readonly #journal: Journal;
  /** In-flight coalescing map (per live executor, in-memory only — see below). */
  readonly #inflight = new Map<string, Promise<StepOutcome<unknown>>>();

  constructor(journal: Journal = new InMemoryJournal(), runId: string = randomUUID()) {
    this.#journal = journal;
    this.runId = runId;
  }

  /**
   * Run or replay `effect` for `stepId` within this run.
   *   • journal absent    → run the effect, record completed (or failed), return { reused:false }
   *   • journal completed → return the recorded result, do NOT run effect, { reused:true }
   *   • journal failed     → throw (a terminalized step is not silently retried)
   *
   * A non-JSON-serializable result terminalizes the step as `failed` rather than
   * escaping uncaught — otherwise a retry would re-run an effect the ledger
   * believes never finished.
   *
   * CONCURRENCY: overlapping calls for the same step on THIS executor coalesce
   * onto one in-flight execution (both callers await the same promise), so a
   * single live executor can never run the effect twice concurrently. This is
   * deliberately in-memory only — the ratified journal stays 3-state
   * (absent / completed / failed) with NO persisted "running" claim, so a
   * process crash mid-effect leaves the step absent and a restart MAY replay it.
   */
  async runStepOnce<T>(
    stepId: string,
    effect: () => Promise<T> | T,
    attempt = 1,
  ): Promise<StepOutcome<T>> {
    const pending = this.#inflight.get(stepId);
    if (pending) return pending as Promise<StepOutcome<T>>;
    const run = this.#runStepExclusive(stepId, effect, attempt).finally(() => {
      this.#inflight.delete(stepId);
    });
    this.#inflight.set(stepId, run as Promise<StepOutcome<unknown>>);
    return run;
  }

  /** The single-flight body of runStepOnce — only ever one live per stepId. */
  async #runStepExclusive<T>(
    stepId: string,
    effect: () => Promise<T> | T,
    attempt: number,
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
      // Serialize INSIDE the guard: a non-JSON result (cycle, BigInt, or a
      // value that stringifies to undefined) must terminalize the step as
      // failed, not throw past the ledger write. A genuinely-undefined (void)
      // result is fine — it encodes to the sentinel.
      serialized = encodeResult(result);
    } catch (err) {
      try {
        await this.#journal.put({
          runId: this.runId,
          stepId,
          status: "failed",
          result: null,
          error: String((err as Error)?.message ?? err),
          attempt,
          updatedAt: Date.now(),
        });
      } catch (journalErr) {
        // The journal write must never MASK the effect error: the caller
        // needs E1 (why the step failed), not E2 (why the ledger write
        // failed). Log E2 and attach it to E1, then rethrow E1 below.
        console.error(
          `[executor] journal write failed while terminalizing step "${stepId}" ` +
            `(run ${this.runId}) — surfacing the effect error; journal error:`,
          journalErr,
        );
        if (err instanceof Error) {
          (err as Error & { journalError?: unknown }).journalError = journalErr;
        }
      }
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

  /**
   * StepExecutor seam (CC-1): coalesce/replay `run` for `step`, returning its
   * result directly (the StepOutcome's `reused` flag is dropped — callers that
   * need it use runStepOnce). Journals completed/failed exactly as runStepOnce.
   */
  async execute<T>(step: string, run: () => T | Promise<T>): Promise<T> {
    const { result } = await this.runStepOnce<T>(step, run);
    return result;
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
