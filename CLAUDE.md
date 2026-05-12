# Claude / agent notes — mastra-design-agent

Context for AI coding agents working in this project.

## What this is

A Mastra agent that redesigns a landing page via tool calls. Uses OpenAI GPT-4o for text and OpenAI Realtime for voice. Tools mutate shared state, frontend re-renders on updates.

## Development

```bash
npm install
cp .env.example .env  # set OPENAI_API_KEY
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
│   ├── routes.ts           # /api/state, /api/chat
│   ├── static.ts           # Serves public/
│   └── voice.ts            # OpenAI Realtime integration
└── llm/
    ├── openai.ts           # GPT-4o provider
    └── voice.ts            # Realtime provider factory
```

## Key points

- **Tools**: Never use `{context}` - tools receive `input` directly
- **State**: Tools mutate via setters in `state/site-state.ts`, don't reassign
- **Paths**: Use `import.meta.url` not `process.cwd()` for file resolution
- **API routes**: Use middleware not `registerApiRoute` for `/api/*`
- **Static serving**: Registered on `/` and `/*` to handle root requests
- **Environment**: `OPENAI_API_KEY` required for both text and voice

## Testing

- Boot test: Server starts, `/api/state` returns JSON
- End-to-end: "make background dark" updates preview  
- Voice test: Click "Start voice" and speak request