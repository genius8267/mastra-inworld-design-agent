import { InworldRealtimeVoice } from "@mastra/voice-inworld";
import type { MastraVoice } from "@mastra/core/voice";

/**
 * Realtime model. The published SDK defaults to an Inworld-hosted model;
 * this demo's tool surface is wide (10 tools), so default to Claude Sonnet
 * for dependable tool calling. Override with INWORLD_REALTIME_MODEL.
 */
const DEFAULT_REALTIME_MODEL = "anthropic/claude-sonnet-4-6";

export function createVoice(): MastraVoice | null {
  const apiKey = process.env.INWORLD_API_KEY;
  if (!apiKey) return null;
  // SDK defaults: semantic_vad turn detection with interrupt_response: true,
  // 15s connect timeout, awaitable speak(), barge-in event surfaced as
  // `interrupted`. No consumer-side patches needed.
  const voice = new InworldRealtimeVoice({
    apiKey,
    model: process.env.INWORLD_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL,
    ...(process.env.INWORLD_SPEAKER ? { speaker: process.env.INWORLD_SPEAKER } : {}),
  });
  // Cast: voice packages bundle their own copy of MastraVoice's base class,
  // whose ECMAScript private brand differs from the @mastra/core copy. The
  // two are interchangeable at runtime; only the structural type check trips.
  return voice as unknown as MastraVoice;
}

export const VOICE_SAMPLE_RATE = 24_000;
