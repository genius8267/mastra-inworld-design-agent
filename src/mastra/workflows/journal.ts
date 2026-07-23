// journal.ts — the durable step ledger (engine-lane).
//
// Q1 ruling (ratified lane contract): the journal is 3-STATE — a step is either
//   • absent    → no record (get() returns undefined)
//   • completed → ran, result recorded
//   • failed    → ran (or serialization failed), error recorded
// There is deliberately NO fourth "running"/"suspended" state: that is deferred
// until the durable LibSQL journal is ratified. Both implementations below
// persist exactly these three states and nothing more.
//
// The store is injectable transport (mirrors the monorepo's ConvexTransport
// split): InMemoryJournal is the offline-tested default; LibSqlJournal persists
// the SAME three states to data/mastra.db so a step survives a process restart.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

/** The two persisted terminal states. "absent" is the implicit third — no row. */
export type JournalStatus = "completed" | "failed";

export interface JournalEntry {
  runId: string;
  stepId: string;
  status: JournalStatus;
  /** JSON-encoded step result; present (non-null) only when completed. */
  result: string | null;
  /** Failure message; present (non-null) only when failed. */
  error: string | null;
  /** Metadata only — the dedupe key is (runId, stepId), never the attempt. */
  attempt: number;
  updatedAt: number;
}

/**
 * The transport the durable executor writes its step ledger through. A step is
 * keyed by (runId, stepId); `get` returning undefined IS the "absent" state.
 */
export interface Journal {
  get(runId: string, stepId: string): Promise<JournalEntry | undefined>;
  put(entry: JournalEntry): Promise<void>;
  list(runId: string): Promise<JournalEntry[]>;
}

const key = (runId: string, stepId: string): string => `${runId}\u0000${stepId}`;

/**
 * In-memory journal — the offline default. No durability across restarts; used
 * by the tests and as the per-session default when no durable store is wired.
 */
export class InMemoryJournal implements Journal {
  readonly #entries = new Map<string, JournalEntry>();

  async get(runId: string, stepId: string): Promise<JournalEntry | undefined> {
    return this.#entries.get(key(runId, stepId));
  }

  async put(entry: JournalEntry): Promise<void> {
    this.#entries.set(key(entry.runId, entry.stepId), entry);
  }

  async list(runId: string): Promise<JournalEntry[]> {
    return [...this.#entries.values()].filter((e) => e.runId === runId);
  }

  /** Test/introspection helper (not part of the Journal contract): every entry,
   *  across all runs, in insertion order. */
  all(): JournalEntry[] {
    return [...this.#entries.values()];
  }
}

/**
 * LibSQL-backed journal — persists the same three states to `data/mastra.db`
 * (or DATABASE_URL). This is durability for the 3-state ledger, NOT the deferred
 * 4-state durable journal: there is still no "running" row, so a crash mid-step
 * leaves the step absent (a retry re-runs it), exactly as in memory.
 */
export class LibSqlJournal implements Journal {
  readonly #client: Client;
  #ready: Promise<void> | null = null;

  constructor(url: string = process.env.DATABASE_URL ?? "file:./data/mastra.db", client?: Client) {
    if (!client && url.startsWith("file:")) {
      mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
    }
    // Injectable client (tests) — mirrors the injectable-transport split above.
    this.#client = client ?? createClient({ url });
  }

  #ensure(): Promise<void> {
    // Rejection-safe memoization: the reset is attached via .catch ON THE
    // ASSIGNED CHAIN and rethrows, so (i) there is exactly one chain — no
    // unhandled-rejection double-fire, (ii) every caller awaiting the failing
    // init (including concurrent ones) still observes the rejection, and
    // (iii) only calls made AFTER the failure retry the schema create. The
    // previous `??=` without the catch cached a rejected promise forever,
    // permanently poisoning the journal after one transient failure.
    this.#ready ??= this.#client
      .execute(
        `CREATE TABLE IF NOT EXISTS workflow_journal (
           run_id     TEXT NOT NULL,
           step_id    TEXT NOT NULL,
           status     TEXT NOT NULL CHECK (status IN ('completed','failed')),
           result     TEXT,
           error      TEXT,
           attempt    INTEGER NOT NULL DEFAULT 1,
           updated_at INTEGER NOT NULL,
           PRIMARY KEY (run_id, step_id)
         )`,
      )
      .then(() => undefined)
      .catch((err: unknown) => {
        this.#ready = null; // subsequent calls retry; current awaiters still reject
        throw err;
      });
    return this.#ready;
  }

  async get(runId: string, stepId: string): Promise<JournalEntry | undefined> {
    await this.#ensure();
    const rs = await this.#client.execute({
      sql: "SELECT run_id, step_id, status, result, error, attempt, updated_at FROM workflow_journal WHERE run_id = ? AND step_id = ?",
      args: [runId, stepId],
    });
    const row = rs.rows[0];
    return row ? rowToEntry(row) : undefined;
  }

  async put(entry: JournalEntry): Promise<void> {
    await this.#ensure();
    await this.#client.execute({
      sql: `INSERT INTO workflow_journal (run_id, step_id, status, result, error, attempt, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (run_id, step_id) DO UPDATE SET
              status = excluded.status,
              result = excluded.result,
              error = excluded.error,
              attempt = excluded.attempt,
              updated_at = excluded.updated_at`,
      args: [
        entry.runId,
        entry.stepId,
        entry.status,
        entry.result,
        entry.error,
        entry.attempt,
        entry.updatedAt,
      ],
    });
  }

  async list(runId: string): Promise<JournalEntry[]> {
    await this.#ensure();
    const rs = await this.#client.execute({
      sql: "SELECT run_id, step_id, status, result, error, attempt, updated_at FROM workflow_journal WHERE run_id = ? ORDER BY updated_at",
      args: [runId],
    });
    return rs.rows.map(rowToEntry);
  }

  /** Release the underlying client (tests / graceful shutdown). */
  close(): void {
    this.#client.close();
  }
}

type Row = Record<string, unknown>;

function rowToEntry(row: Row): JournalEntry {
  const status = String(row.status);
  if (status !== "completed" && status !== "failed") {
    // The CHECK constraint makes this unreachable; guard the invariant anyway
    // so a corrupted row can never widen the 3-state contract silently.
    throw new Error(`journal row has invalid status "${status}"`);
  }
  return {
    runId: String(row.run_id),
    stepId: String(row.step_id),
    status,
    result: row.result == null ? null : String(row.result),
    error: row.error == null ? null : String(row.error),
    attempt: Number(row.attempt),
    updatedAt: Number(row.updated_at),
  };
}
