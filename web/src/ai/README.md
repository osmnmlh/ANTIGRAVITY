# web/src/ai: AI components (issue #13 + proactive alerts)

Self-contained: own CSS (`ai-` prefix), own data (SSE + fetch to `/api/ai/*`), no new dependencies.
Everything is Turkish (ADR-0005); strings live in `labels.ts`. API shapes: `shared/contracts/ai.md`.

| Component | Where | What |
| --- | --- | --- |
| `<AlertCenter onOpenAstronaut? onAskAi? placement? />` | **once**, top level of `App.tsx` | Status bar (AI live/offline, 🔊 voice toggle, 🔔 active alerts) + popup. `placement`: `bottom-right` (default, never covers the topbar), `top-right`, or `inline` to put it in your own header. New alert → red: tone + one short phrase, amber: tone only. The popup is compact (title + "Anladım", "AI önerisi", "Astronota git", "AI'a sor"); **"AI önerisi"** opens the written steps / why / when to call the flight surgeon and a "Sesli oku" button |
| `<AiChat />` | cockpit view | Chat about the cabin + whole crew |
| `<AiChat crewId="crew-1" crewName="Dr. Elena Vance" />` | astronaut detail view | Chat about one astronaut; each context keeps its own history |
| `<DevicesPanel crewNames? />` | cockpit | Connected phones (live), how many the newest alert reached, who acknowledged |
| `<AiDemoControls />` | wherever the stage operator clicks | Buttons that fire demo scenarios + reset |
| `askAi(text)` | anywhere | Sends a question to the chat on screen |
| `useAiState()` | anywhere | `{ connection, cabin, alerts }`: cabin readings with precomputed status for the cockpit tiles |

## Mounting

Already mounted in `web/src/App.tsx` (see `docs/ai/INTEGRATION.md`). Generic version:

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

**ElevenLabs clips (the alert voice):** the short alert phrases are pre-rendered with ElevenLabs by `backend/ai/make-voice-clips.mjs` into `web/public/ai-voice/`
(52 mp3 + `manifest.json`, already committed). Voice: **Alice** (free premade female) with `eleven_turbo_v2_5` and `language_code: tr`, flat style-free settings.
The web plays a clip through a soft low-pass, slightly slower ("hafif donuk", constants `DULL` in `voice.ts`). The Turkish voice "Betül Tuna" is a library voice:
the API refuses it on the free plan (402); with a paid plan set `ELEVENLABS_VOICE_ID=6GYyziau4Hk8qdg7od5c`. To change voice or add phrases: key in `backend/.env`
(`ELEVENLABS_API_KEY`, git-ignored), `node --experimental-strip-types backend/ai/make-voice-clips.mjs` (`--force` = render all again), commit the folder.
Clips play instantly, need no key or network at runtime and cost no quota. A phrase without a clip, and the "Sesli oku" reading, use the browser voice below.

**Which browser voice:** the page picks the best **female Turkish** voice of the device (Windows "Microsoft Emel", macOS / iOS "Yelda", Chrome "Google Türkçe";
male voices such as "Microsoft Tolga" come last) and speaks it a little slower and lower than normal. The ⚙ button in the alert bar ("Ses ayarları") lists every
Turkish voice of the device, has three character presets (**Robotik kadın**, Doğal kadın, Yavaş ve net), sliders for speed and tone and a "Dene" button; the choice is
kept per device. A browser cannot add real effects to its own speech, so the "robotic" character is only as strong as the device voice allows.
Gemini's speech models were tried and are not used for alerts: about 2.5-3.5 s per phrase and a very tight rate limit (HTTP 429 after a few requests).

Deliberately quiet: only a **red** alert is spoken, and only the short `spokenText` ("Uyarı. Kan basıncı düşük."); amber is a soft tone.
Details and Gemini's interpretation are written in the "AI önerisi" panel and read aloud only when the crew presses "Sesli oku".
After a dropped connection the page announces the alerts it missed once.
