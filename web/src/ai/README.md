# web/src/ai: AI components (issue #13 + proactive alerts)

Self-contained: own CSS (`ai-` prefix), own data (SSE + fetch to `/api/ai/*`), no new dependencies.
Everything is Turkish (ADR-0005); strings live in `labels.ts`. API shapes: `shared/contracts/ai.md`.

| Component | Where | What |
| --- | --- | --- |
| `<AlertCenter onOpenAstronaut? onAskAi? />` | **once**, top level of `App.tsx` | Top-right dock (AI live/offline, 🔊 voice toggle, 🔔 active alerts). New alert → beep + Turkish speech + popup with why / do now / when to call the flight surgeon, "Anladım", "Astronota git", "AI'a sor" |
| `<AiChat />` | cockpit view | Chat about the cabin + whole crew |
| `<AiChat crewId="crew-1" crewName="Dr. Elena Vance" />` | astronaut detail view | Chat about one astronaut; each context keeps its own history |
| `<AiDemoControls />` | wherever the stage operator clicks | Buttons that fire demo scenarios + reset |
| `askAi(text)` | anywhere | Sends a question to the chat on screen |
| `useAiState()` | anywhere | `{ connection, cabin, alerts }`: cabin readings with precomputed status for the cockpit tiles |

## Mounting (web team, 4 lines)

```tsx
import { AiChat, AiDemoControls, AlertCenter, askAi } from './ai'

<AlertCenter
  onOpenAstronaut={(crewId) => setSelectedCrew(crewId)}          // your detail-view navigation
  onAskAi={(a) => askAi(`${a.title}. Şimdi ne yapmalıyız?`)}
/>
{selectedCrew ? <AiChat crewId={selectedCrew} crewName={name} /> : <AiChat />}
```

## Server

- Base URL: `VITE_AI_URL`, else `VITE_API_URL`, else `http://localhost:8787` (the relay with the AI module plugged in).
- Standalone AI dev server: `node --experimental-strip-types backend/ai/dev-server.mjs` (port 8788), then
  `VITE_AI_URL=http://localhost:8788 npm run dev`.
- Server down → dock shows "AI çevrimdışı", chat says so, nothing crashes. Gemini is never called from the browser.

## Try it without touching App.tsx

`npm run dev` → open `/ai-preview.html` (dev-only sandbox in `preview/`, not in the production build).

## Voice

Browsers block audio until a click, so voice starts **off**: click "🔇 Sesli uyarılar kapalı" once. The choice is remembered
in this browser; after a reload the first click anywhere re-enables audio. Speech uses a `tr-TR` voice when the OS has one
(Windows/macOS/Chrome do).
