import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nextRunnable,
  isSettled,
  expandForeach,
  loopShouldContinue,
  loopStepId,
  type ScheduleNode,
} from "./control-flow";

describe("control-flow: nextRunnable — dependency ordering", () => {
  it("runs a dep chain one step at a time", () => {
    const nodes: ScheduleNode[] = [{ id: "a" }, { id: "b", deps: ["a"] }, { id: "c", deps: ["b"] }];
    // Nothing completed → only the dep-free root is runnable.
    assert.deepEqual(nextRunnable(nodes, new Set()), ["a"]);
    // a done → b unblocks; c still waits on b.
    assert.deepEqual(nextRunnable(nodes, new Set(["a"])), ["b"]);
    // a,b done → c unblocks.
    assert.deepEqual(nextRunnable(nodes, new Set(["a", "b"])), ["c"]);
  });

  it("returns independent dep-satisfied steps together (parallel fan-out)", () => {
    const nodes: ScheduleNode[] = [
      { id: "root" },
      { id: "x", deps: ["root"] },
      { id: "y", deps: ["root"] },
    ];
    assert.deepEqual(nextRunnable(nodes, new Set(["root"])).sort(), ["x", "y"]);
  });

  it("never returns an already-completed step", () => {
    const nodes: ScheduleNode[] = [{ id: "a" }, { id: "b", deps: ["a"] }];
    assert.deepEqual(nextRunnable(nodes, new Set(["a", "b"])), []);
  });
});

describe("control-flow: nextRunnable — branch enabledWhen", () => {
  const nodes: ScheduleNode[] = [
    { id: "decide" },
    { id: "hot", deps: ["decide"], enabledWhen: (r) => r["decide"] === "hot" },
    { id: "cold", deps: ["decide"], enabledWhen: (r) => r["decide"] === "cold" },
  ];

  it("selects only the enabled branch path", () => {
    assert.deepEqual(nextRunnable(nodes, new Set(["decide"]), { decide: "hot" }), ["hot"]);
    assert.deepEqual(nextRunnable(nodes, new Set(["decide"]), { decide: "cold" }), ["cold"]);
  });

  it("a disabled branch is never runnable even with deps satisfied", () => {
    const runnable = nextRunnable(nodes, new Set(["decide"]), { decide: "hot" });
    assert.ok(!runnable.includes("cold"));
  });
});

describe("control-flow: isSettled", () => {
  it("is NOT settled while an enabled, dep-satisfied step still waits", () => {
    const nodes: ScheduleNode[] = [{ id: "a" }, { id: "b", deps: ["a"] }];
    assert.equal(isSettled(nodes, new Set(["a"])), false);
  });

  it("is settled when every node is completed", () => {
    const nodes: ScheduleNode[] = [{ id: "a" }, { id: "b", deps: ["a"] }];
    assert.equal(isSettled(nodes, new Set(["a", "b"])), true);
  });

  it("is settled when the only unrun nodes are disabled branch paths", () => {
    const nodes: ScheduleNode[] = [
      { id: "decide" },
      { id: "hot", deps: ["decide"], enabledWhen: (r) => r["decide"] === "hot" },
      { id: "cold", deps: ["decide"], enabledWhen: (r) => r["decide"] === "cold" },
    ];
    // Took the hot path; cold is disabled and never runs → settled.
    assert.equal(isSettled(nodes, new Set(["decide", "hot"]), { decide: "hot" }), true);
  });
});

describe("control-flow: expandForeach", () => {
  it("expands items into indexed parallel nodes carrying the deps", () => {
    const expanded = expandForeach("send", ["a", "b", "c"], ["gather"]);
    assert.deepEqual(
      expanded.map((n) => n.id),
      ["send[0]", "send[1]", "send[2]"],
    );
    assert.ok(expanded.every((n) => n.deps?.includes("gather")));
    // All independent → all runnable at once once the dep is met.
    assert.equal(nextRunnable(expanded, new Set(["gather"])).length, 3);
  });

  it("expands an empty list to no nodes", () => {
    assert.deepEqual(expandForeach("send", []), []);
  });
});

describe("control-flow: loop continuation", () => {
  it("dowhile repeats while the predicate holds", () => {
    assert.equal(loopShouldContinue("dowhile", true), true);
    assert.equal(loopShouldContinue("dowhile", false), false);
  });

  it("dountil repeats until the predicate holds", () => {
    assert.equal(loopShouldContinue("dountil", false), true);
    assert.equal(loopShouldContinue("dountil", true), false);
  });

  it("gives each iteration a distinct step id", () => {
    assert.equal(loopStepId("poll", 0), "poll#0");
    assert.equal(loopStepId("poll", 1), "poll#1");
    assert.notEqual(loopStepId("poll", 0), loopStepId("poll", 1));
  });
});
