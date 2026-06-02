import { createOpenAI } from "@ai-sdk/openai";

const INWORLD_KEY = process.env.INWORLD_API_KEY ?? "";

export const openai = createOpenAI({
  baseURL: "https://api.inworld.ai/v1",
  apiKey: INWORLD_KEY,
  headers: {
    Authorization: `Basic ${INWORLD_KEY}`,
  },
});

export const DEFAULT_OPENAI_MODEL = "openai/gpt-4.1";
