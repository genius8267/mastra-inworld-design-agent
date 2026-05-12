# Mastra Design Agent

A Mastra agent that redesigns a live landing page via OpenAI tool calls. Features both text and voice chat interfaces.

## Demo

Talk or type to redesign the landing page:

- **"Make the background dark"** → calls `set_theme({bg: "#1a1a1a"})`
- **"Change the font to Inter"** → calls `set_typography({fontFamily: "Inter"})`  
- **"Make the headline say 'Welcome'"** → calls `set_copy({slot: "headline", text: "Welcome"})`

## Quick Start

```bash
git clone https://github.com/cshape/mastra-inworld-design-agent.git
cd mastra-inworld-design-agent
npm install
cp .env.example .env
# Add your OPENAI_API_KEY to .env
npm run dev
```

Open http://localhost:4111 and start chatting!

## Features

- **Text & Voice Chat** - Type or speak your design requests
- **Live Preview** - Right pane updates in real-time as tools execute  
- **Tool Visibility** - See every tool call with full JSON parameters
- **5 Design Tools** - theme, typography, copy, layout, reset

## Deploy to Render

1. Connect repo to Render
2. Set `OPENAI_API_KEY` environment variable
3. Deploy! (Uses included `render.yaml`)

## Configuration

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | yes | OpenAI API key for both text and voice |
| `PORT` | no | Server port (defaults to 4111) |

## Architecture

- **Agent**: Mastra agent with OpenAI GPT-4o model
- **Tools**: 5 Zod-validated tools that mutate shared state
- **Voice**: OpenAI Realtime API for speech input/output
- **Frontend**: Vanilla JS with no build step
- **State**: In-memory (resets on restart)