import { createOpenAI } from "@ai-sdk/openai";

const INWORLD_KEY = process.env.INWORLD_API_KEY ?? "";

const provider = createOpenAI({
  baseURL: "https://api.inworld.ai/v1",
  apiKey: INWORLD_KEY,
  headers: {
    Authorization: `Basic ${INWORLD_KEY}`,
  },
});

/**
 * Text-path model factory. MUST be the chat-completions model: since
 * @ai-sdk/openai v2, the bare provider call (`provider(id)`) builds a
 * Responses-API model (POST /v1/responses), which Inworld's router doesn't
 * implement — every request 404s. `provider.chat(id)` pins /chat/completions.
 */
export const openai = (modelId: string) => provider.chat(modelId);

export const DEFAULT_OPENAI_MODEL = process.env.INWORLD_TEXT_MODEL ?? "openai/gpt-4.1";
