// watchdog-canary.ts — B4 canary for the wedge-recovery monkeypatch seams.
//
// index.ts patches `raw.client.emit` and `raw.sendEvent` on the voice provider
// to arm/disarm the response watchdog. Both patches are guarded (`if
// (raw.client)` / `if (raw.sendEvent)`), so an alpha SDK bump that renames or
// removes either seam would fail SILENTLY OPEN: the watchdog never arms and
// wedge recovery is gone with no signal. This canary asserts both seams are
// functions right after `agent.getVoice()` and emits a loud startup diagnostic
// on mismatch — it deliberately does NOT hard-crash the agent (a degraded
// watchdog is worse than no session only if nobody notices; the diagnostic is
// the noticing).

/** The raw seam shape index.ts monkeypatches for watchdog wiring. */
export interface WatchdogSeams {
  client?: { emit?: unknown };
  sendEvent?: unknown;
}

/**
 * Assert the two watchdog monkeypatch seams exist on the voice provider.
 * Returns true when both are intact; on drift, emits one loud diagnostic via
 * `log` (default: console.error) naming exactly which seam(s) vanished, and
 * returns false. Never throws.
 */
export function assertWatchdogSeams(
  raw: WatchdogSeams,
  log: (message: string) => void = (m) => console.error(m),
): boolean {
  const missing: string[] = [];
  if (typeof raw?.client?.emit !== "function") missing.push("client.emit");
  if (typeof raw?.sendEvent !== "function") missing.push("sendEvent");
  if (missing.length === 0) return true;
  log(
    `[watchdog-canary] voice SDK seam drift: missing ${missing.join(" and ")} — ` +
      "the wedge-recovery watchdog CANNOT arm via the affected path(s). " +
      "The session will run WITHOUT stall recovery. Likely cause: a voice SDK " +
      "upgrade changed the raw client shape; re-verify the monkeypatch seams in " +
      "src/index.ts (connectVoice) against the installed SDK version.",
  );
  return false;
}
