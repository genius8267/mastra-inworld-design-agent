// control-flow.ts — pure workflow scheduling decisions (engine-lane).
//
// The deterministic complement to the durable executor (executor.ts): given the
// control-flow structure (a set of ScheduleNodes) and the steps completed so
// far, decide WHAT runs next — dependency ordering, parallel fan-out, branch
// selection, foreach expansion, loop continuation. These are pure functions
// with no I/O, journal, or transport, so they are fully offline-tested; the
// durable EXECUTION of the chosen steps (executor.ts) is what carries state.
//
// Adapted from intunelabs-monorepo services/mastra .../workflows/control-flow.ts
// (Convex-backed there; here it stays pure and backs the in-memory / libsql
// journal instead).

export interface ResultMap {
  [stepId: string]: unknown;
}

export interface ScheduleNode {
  id: string;
  /** Step ids that must be completed before this node is eligible (default: none). */
  deps?: string[];
  /** Branch gate: eligible only when this returns true (default: always). Model a
   *  branch as sibling nodes whose `enabledWhen` predicates select which path(s)
   *  run based on the accumulated results. */
  enabledWhen?: (results: ResultMap) => boolean;
}

const depsSatisfied = (node: ScheduleNode, completed: ReadonlySet<string>): boolean =>
  (node.deps ?? []).every((dep) => completed.has(dep));

const enabled = (node: ScheduleNode, results: ResultMap): boolean =>
  node.enabledWhen ? node.enabledWhen(results) : true;

/**
 * The steps runnable RIGHT NOW: deps all completed, branch-enabled, not yet
 * completed. Returning more than one ⇒ they are independent and run in parallel;
 * a single dep chain returns one at a time (sequential); a branch returns only
 * the enabled path(s).
 */
export function nextRunnable(
  nodes: ScheduleNode[],
  completed: ReadonlySet<string>,
  results: ResultMap = {},
): string[] {
  return nodes
    .filter(
      (node) => !completed.has(node.id) && depsSatisfied(node, completed) && enabled(node, results),
    )
    .map((node) => node.id);
}

/**
 * The schedule is settled when nothing is runnable AND every node is either
 * completed or currently disabled (a branch path not taken). Guards against
 * calling a run "done" while an enabled, dep-satisfied step still waits.
 */
export function isSettled(
  nodes: ScheduleNode[],
  completed: ReadonlySet<string>,
  results: ResultMap = {},
): boolean {
  if (nextRunnable(nodes, completed, results).length > 0) return false;
  return nodes.every((node) => completed.has(node.id) || !enabled(node, results));
}

/**
 * Expand a foreach over `items` into one independent node per item — all
 * runnable in parallel, each id suffixed with its index so the journal dedupes
 * per item.
 */
export function expandForeach(
  baseId: string,
  items: readonly unknown[],
  deps: string[] = [],
): ScheduleNode[] {
  return items.map((_, i) => ({ id: `${baseId}[${i}]`, deps: [...deps] }));
}

export type LoopMode = "dowhile" | "dountil";

/**
 * Loop continuation for dowhile / dountil. Both run the body once before testing
 * (do-loops); `dowhile` repeats WHILE the predicate holds, `dountil` repeats
 * UNTIL it holds.
 */
export function loopShouldContinue(mode: LoopMode, predicate: boolean): boolean {
  return mode === "dowhile" ? predicate : !predicate;
}

/** Per-iteration step id for a loop body, so each iteration dedupes distinctly. */
export function loopStepId(baseId: string, iteration: number): string {
  return `${baseId}#${iteration}`;
}
