# web/src/ai: AI components (issue #13 + proactive alerts)

Self-contained: own CSS (`ai-` prefix), own data (SSE + fetch to `/api/ai/*`), no new dependencies.
Everything is Turkish (ADR-0005); strings live in `labels.ts`. API shapes: `shared/contracts/ai.md`.

| Component | Where | What |
| --- | --- | --- |
| `<AlertCenter onOpenAstronaut? onAskAi? />` | **once**, top level of `App.tsx` | Top-right dock (AI live/offline, 🔊 voice toggle, 🔔 active alerts). New alert → beep + Turkish speech + popup with why / do now / when to call the flight surgeon, "Anladım", "Astronota git", "AI'a sor" |
| `<AiChat />` | cockpit view | Chat about the cabin + whole crew |
| `<AiChat crewId="crew-1" crewName="Dr. Elena Vance" />` | astronaut detail view | Chat about one astronaut; each context keeps its own history |
| `<DevicesPanel crewNames? />` | cockpit | Connected phones (live), how many the newest alert reached, who acknowledged |
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

- Base URL: `VITE_AI_URL`, else `VITE_API_URL`, else port 8787 of the same host as the page (so a phone that opened
  `http://<pc-ip>:5174/phone.html` reaches the relay at `http://<pc-ip>:8787`).
- Standalone AI dev server: `node --experimental-strip-types backend/ai/dev-server.mjs` (port 8788), then
  `VITE_AI_URL=http://localhost:8788 npm run dev`.
- Server down → dock shows "AI çevrimdışı", chat says so, nothing crashes. Gemini is never called from the browser.

## Test phone

`/phone.html?crewId=crew-1` is a stand-in for the iPhone app: it registers as a device, receives alerts at the same moment as the
other phones, vibrates, speaks, raises a system notification when in the background and acknowledges. One tab = one phone, so two
tabs simulate two phones; real phones in the same Wi-Fi work too (`backend/ai/test-env.mjs` prints the links). Like
`ai-preview.html` it is dev-only; to ship it, add it to `build.rollupOptions.input` in `vite.config.ts`.

## Try it without touching App.tsx

`node --experimental-strip-types backend/ai/test-env.mjs` (repo root) starts relay + web and prints the links, or `npm run dev` → open `/ai-preview.html` (dev-only sandbox in `preview/`, not in the production build).

## Voice

Browsers block audio until a click, so voice starts **off**: click "🔇 Sesli uyarılar kapalı" once. The choice is remembered
in this browser; after a reload the first click anywhere re-enables audio. Speech uses a `tr-TR` voice when the OS has one
(Windows/macOS/Chrome do).
