// B4 — watchdog monkeypatch canary.
//
// index.ts monkeypatches raw.client.emit and raw.sendEvent behind `if (...)`
// guards, so an SDK bump removing either seam fails silently open. The canary
// must emit exactly one loud diagnostic naming the missing seam(s) — and stay
// silent (and true) on the normal shape. It must never throw.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertWatchdogSeams, type WatchdogSeams } from "./watchdog-canary";

const capture = () => {
  const messages: string[] = [];
  return { messages, log: (m: string) => messages.push(m) };
};

const normal: WatchdogSeams = {
  client: { emit: () => true },
  sendEvent: (_type: string, _data: unknown) => {},
};

describe("watchdog canary (B4)", () => {
  it("normal SDK shape → true, silent", () => {
    const { messages, log } = capture();
    assert.equal(assertWatchdogSeams(normal, log), true);
    assert.equal(messages.length, 0);
  });

  it("missing both seams → false, one diagnostic naming both", () => {
    const { messages, log } = capture();
    assert.equal(assertWatchdogSeams({}, log), false);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /client\.emit and sendEvent/);
    assert.match(messages[0], /watchdog/i);
  });

  it("missing only sendEvent → diagnostic names just sendEvent", () => {
    const { messages, log } = capture();
    const raw: WatchdogSeams = { client: { emit: () => true } };
    assert.equal(assertWatchdogSeams(raw, log), false);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /missing sendEvent/);
    assert.doesNotMatch(messages[0], /client\.emit/);
  });

  it("seams present but not functions → false (drift, not absence)", () => {
    const { messages, log } = capture();
    const raw = { client: { emit: "nope" }, sendEvent: 42 } as unknown as WatchdogSeams;
    assert.equal(assertWatchdogSeams(raw, log), false);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /client\.emit and sendEvent/);
  });

  it("never throws, even on a null-ish voice object", () => {
    const { log } = capture();
    assert.doesNotThrow(() => assertWatchdogSeams(null as unknown as WatchdogSeams, log));
    assert.equal(assertWatchdogSeams(null as unknown as WatchdogSeams, log), false);
  });
});
