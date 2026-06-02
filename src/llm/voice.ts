import { InworldRealtimeVoice } from "@mastra/voice-inworld-realtime";
import type { MastraVoice } from "@mastra/core/voice";

export function createVoice(): MastraVoice | null {
  const apiKey = process.env.INWORLD_API_KEY;
  if (!apiKey) return null;
  // SDK defaults: semantic_vad turn detection with interrupt_response: true,
  // 15s connect timeout, awaitable speak(), barge-in event surfaced as
  // `interrupted`. No consumer-side patches needed.
  return new InworldRealtimeVoice({ apiKey });
}

export const VOICE_SAMPLE_RATE = 24_000;
