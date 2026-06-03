# Mastra Design Agent

A deliberately ugly landing page with a voice agent that redesigns it live. Talk to it — colors, fonts, copy, layout, the works — and watch every change land in real time.

Built with [Mastra](https://mastra.ai) and [`@mastra/voice-inworld`](https://www.npmjs.com/package/@mastra/voice-inworld)'s `InworldRealtimeVoice`: full-duplex speech with semantic-VAD turn taking, barge-in, and server-side tool calling. One Inworld API key covers everything — realtime voice and the agent's text-path model (routed through Inworld's OpenAI-compatible API).

## What to try

Press the mic button and say:

- **"Make it feel like a Swiss design poster"** — vibes work
- **"Background cream, headline serif, accent red"** — specifics work
- **"Apply the sunset preset"** — presets: default, dark, cream, ocean, sunset, mono, forest, neon
- **"Change the third feature card"** / **"add a card about pricing"** — everything on the page is editable
- Interrupt it mid-sentence — barge-in cuts playback within ~100ms

## Quick start

```bash
npm install
cp .env.example .env   # paste your INWORLD_API_KEY (platform.inworld.ai)
npm run dev            # http://localhost:4111
```

## Mastra Studio at /admin

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` and the same server exposes [Mastra Studio](https://mastra.ai/docs/studio/overview) at `/admin`, behind basic auth. Leave the vars unset and `/admin` is disabled.

**Studio edits go live.** The project wires up [Mastra's editor](https://mastra.ai/docs/editor/overview) with a shared SQLite database: edit the designer's instructions in Studio (Agents → designer → Editor), save — that's a draft you can test in the playground — then **Activate** the version, and the next public voice session speaks the new prompt. No redeploy, full version history and rollback. Set `PUBLIC_AGENT_STATUS=draft` if you'd rather have every save go live immediately.

Code-owned fields (model, tool implementations) can't be changed from Studio — instructions are the live-tunable surface.

## Deploy to Render

The included [`render.yaml`](render.yaml) deploys everything as **one web service**:

| Path | Audience |
|---|---|
| `/` | Public — the demo page + voice WebSocket |
| `/admin` | You — Mastra Studio, basic-auth gated |

1. Push this repo to GitHub
2. Render dashboard → **New → Blueprint** → pick the repo
3. Fill in `INWORLD_API_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` when prompted

## How it works

```
                       ┌──────────────────────────────────────────────┐
 browser ── WS ──────► │ public server (src/index.ts, $PORT)          │
   mic PCM16 in        │  /            static page (public/)          │
   audio PCM16 out     │  /api/state   landing-page defaults          │
   transcripts/state   │  /api/voice   per-session agent + voice      │
                       │  /admin/*     basic auth ► reverse proxy ──┐ │
                       └────────────────────────────────────────────┼─┘
                                                                    ▼
                       ┌──────────────────────────────────────────────┐
                       │ Mastra server child (mastra build --studio)  │
                       │  loopback-only, internal port                │
                       │  /admin       Studio UI                      │
                       │  /admin/api   Mastra API                     │
                       └──────────────────────────────────────────────┘
```

- **Per-session isolation**: every voice WebSocket gets its own agent, its own `InworldRealtimeVoice` connection, and its own site-state store. Your "make it dark" never touches anyone else's page.
- **Tools, not markup**: the agent can only change the page through 10 Zod-validated tools (`set_theme`, `set_typography`, `set_copy`, `set_layout`, `add/remove/update_feature`, `apply_preset`, `set_marquee`, `reset`). Tool results stream back over the WS as state snapshots; the frontend re-renders.
- **Two processes, one service**: Mastra's server doesn't host custom WebSockets, so the public app owns `$PORT` and proxies `/admin/*` (HTTP *and* WS upgrades) to a `mastra build --studio` child bound to loopback. Auth accepts basic-auth headers or a signed session cookie — the cookie is what lets Studio's playground WebSockets through a browser, which won't attach Authorization headers to WS handshakes.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `INWORLD_API_KEY` | yes | Base64 runtime key from [platform.inworld.ai](https://platform.inworld.ai). Covers voice + text model. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | no | Enable Mastra Studio at `/admin`. Unset = disabled. |
| `PORT` | no | Public server port (default 4111) |
| `STUDIO_PORT` | no | Internal Studio port (default 4112, loopback only) |
| `INWORLD_REALTIME_MODEL` | no | Realtime voice LLM via Inworld's router (default `anthropic/claude-sonnet-4-6`) |
| `INWORLD_TEXT_MODEL` | no | Studio text-chat model via Inworld's router (default `openai/gpt-4.1`) |
| `DATABASE_URL` | no | Shared Studio-edits DB (default `file:./data/mastra.db`) |
| `PUBLIC_AGENT_STATUS` | no | `published` (default: edits go live on Activate) or `draft` (live on save) |

## File map

```
src/
├── index.ts            # public server: static, /api/state, /api/voice WS, /admin glue
├── admin.ts            # basic auth, HTTP + WS reverse proxy, Studio child process
├── llm/
│   ├── openai.ts       # text-path model provider (Inworld's OpenAI-compatible router)
│   └── voice.ts        # InworldRealtimeVoice factory
└── mastra/
    ├── index.ts        # Mastra instance for Studio (bundled by `mastra build --studio`)
    ├── store.ts        # shared SQLite storage — the Studio-edits DB both processes open
    ├── resolve-instructions.ts  # public server's per-session read of published edits
    ├── agents/designer.ts
    ├── state/site-state.ts
    └── tools/          # the 10 design tools
public/                 # the landing page — vanilla JS, no build step
```

## Package versions

`InworldRealtimeVoice` ships in `@mastra/voice-inworld`, currently on the npm **`alpha`** tag — this repo pins `@mastra/voice-inworld@0.3.0-alpha.1` and `@mastra/core@1.38.0-alpha.5` (`.npmrc` sets `legacy-peer-deps` until the stable releases land). For a minimal terminal-only example of the same voice stack, see [inworld-mastra-cli-demo](https://github.com/cshape/inworld-mastra-cli-demo).

## License

[MIT](LICENSE)
