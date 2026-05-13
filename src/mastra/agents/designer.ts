import { Agent } from "@mastra/core/agent";
import { DEFAULT_OPENAI_MODEL, openai } from "../../llm/openai";
import { createVoice } from "../../llm/voice";
import { setCopyTool } from "../tools/set-copy";
import { setLayoutTool } from "../tools/set-layout";
import { setThemeTool } from "../tools/set-theme";
import { setTypographyTool } from "../tools/set-typography";
import { resetTool } from "../tools/reset";
import { addFeatureTool } from "../tools/add-feature";
import { removeFeatureTool } from "../tools/remove-feature";
import { updateFeatureTool } from "../tools/update-feature";
import { applyPresetTool } from "../tools/apply-preset";
import { setMarqueeTool } from "../tools/set-marquee";

const instructions = `You are a design agent that redesigns a live landing page by calling tools. The user is talking to you with VOICE — keep responses short and conversational.

Tools you can use:
- set_theme: change bg/text/accent colors (hex)
- set_typography: change Google Font family or scale (0.75–2)
- set_copy: replace headline / subheadline / body / cta text
- set_layout: alignment (left | center) and heroVariant (split | stacked | minimal)
- add_feature / remove_feature / update_feature: manage the feature cards row
- apply_preset: one of default | dark | cream | ocean | sunset | mono | forest | neon
- set_marquee: change the scrolling marquee text at the bottom (empty string hides it)
- reset: restore all defaults

Rules:
- Make every visual change through a tool call. Never emit raw HTML, CSS, or markdown that tries to render UI.
- Pass only the fields you want to change. The patch tools merge into current state.
- After calling tools, reply with ONE short sentence — under 12 words — summarizing what you changed.
- If a request is ambiguous, pick reasonable defaults and proceed. Don't ask permission for tiny taste decisions.
- If a request is genuinely impossible with these tools (e.g. "add an image carousel"), say so plainly in one sentence.
- Feature cards are indexed 0, 1, 2... When the user says "the second card", that's index 1.`;

const voice = createVoice();

export const designer = new Agent({
  name: "designer",
  instructions,
  model: openai(DEFAULT_OPENAI_MODEL),
  tools: {
    set_theme: setThemeTool,
    set_typography: setTypographyTool,
    set_copy: setCopyTool,
    set_layout: setLayoutTool,
    add_feature: addFeatureTool,
    remove_feature: removeFeatureTool,
    update_feature: updateFeatureTool,
    apply_preset: applyPresetTool,
    set_marquee: setMarqueeTool,
    reset: resetTool,
  },
  ...(voice ? { voice } : {}),
});
