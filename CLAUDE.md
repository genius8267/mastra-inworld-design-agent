# Claude / agent notes — mastra-design-agent

Context for AI coding agents working in this project.

## What this is

A Mastra agent that redesigns a landing page via tool calls. Uses Inworld Realtime for voice; the agent's text-path model is routed through Inworld's OpenAI-compatible router. Tools mutate shared state, frontend re-renders on updates.

## Development

```bash
npm install
cp .env.example .env  # set INWORLD_API_KEY
npm run dev          # localhost:4111
```

## File structure

```
src/
├── mastra/
│   ├── agents/designer.ts  # Main agent with tools
│   ├── tools/              # 5 tool definitions 
│   └── state/site-state.ts # Shared state management
├── server/
│   ├── routes.ts           # /api/state
│   ├── static.ts           # Serves public/
│   └── voice.ts            # Inworld Realtime integration
└── llm/
    ├── openai.ts           # Text-model provider (pointed at Inworld router)
    └── voice.ts            # Realtime provider factory
```

## Key points

- **Tools**: Never use `{context}` - tools receive `input` directly
- **State**: Tools mutate via setters in `state/site-state.ts`, don't reassign
- **Paths**: Use `import.meta.url` not `process.cwd()` for file resolution
- **API routes**: Use middleware not `registerApiRoute` for `/api/*`
- **Static serving**: Registered on `/` and `/*` to handle root requests
- **Environment**: `INWORLD_API_KEY` required for both the realtime voice session and the text-path model (routed through Inworld)

## Testing

- Boot test: Server starts, `/api/state` returns JSON
- End-to-end: "make background dark" updates preview  
- Voice test: Click "Start voice" and speak request