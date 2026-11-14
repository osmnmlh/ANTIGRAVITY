# Integrating the AI with the web and the relay

State on 2026-11-14 (main). Nothing here needs a new dependency.

## One dataset
`shared/mock/all-data.json` is the master dataset (3 astronauts with packets and `sampleHistory`, `nasaHazards`, `historicalIncidents` with phases,
the flat `samples`). The relay (`backend/server.mjs`), the web data hook (`web/src/data/useHealthData.ts`) and everything under `backend/ai/`
and `web/src/ai/` read it. The older split files (`astronaut-packets.json`, `samples.json`, `nasa-hazards.json`, `historical-incidents.json`)
are no longer read by any code, so edit `all-data.json` only. The relay's `/api/packets` still returns the packets without `sampleHistory`.

## Where the AI is wired

| What | Where |
| --- | --- |
| AI module (alerts, cabin, chat, devices, ntfy, Gemini interpretation) | `backend/ai/`, wired in `server.mjs` (`createAi`, `ai.handle`, `ai.onSamples`, `ai.onCabinHint`) |
| Cabin values of an incident replay | `ai.onCabinHint(phase.cabinHint)` in the incident phase loop, `ai.onCabinHint(null)` when a simulation ends or resets |
| Alert bar, popup, voice | `<AlertCenter>` at the root of `web/src/App.tsx`: "Astronota git" selects the astronaut and opens **Astronotlar**, "AI'a sor" fills the chat |
| Astronotlar workspace | `<AiChat crewId={selectedCrewId} … />` |
| Ana üs workspace | `<AiChat />` (cabin + whole crew), `<DevicesPanel>` (connected phones), `<AiDemoControls>` (scenario buttons) |
| Web ↔ relay | the web hook already uses `/api/stream`, `POST /api/samples`, `/api/simulation/*`: a value typed in the form or produced by a simulation reaches the AI rules, the alerts come back on `/api/ai/stream` |

`onCabinHint` reads the text of an incident phase (`ppCO2: 8.2 mmHg · Kabin Sıcaklığı: 3.8 °C`, `Kontaminant: 14.5 ppm`, `Güç: Kısıtlı`) into cabin readings
(`backend/ai/cabin-hint.mjs`). What a phase does not state is nominal again. Two qualitative alarms use a fixed demo value (`O2 Basınç Alarmı` = 17.9 kPa,
`Ana Güç Düşüyor` = degraded). EVA suit pressure is not the cabin and is ignored.

## Web guidance panel
The "Ne anlama geliyor / Uzayda neden önemli / Şimdi ne yapabilirsin / Ne zaman haber vermeli" panel of `App.tsx` shows the backend's AI recommendation for the
selected indicator (`useAiIndicatorGuidance`, contract §9) and a line saying who wrote it; with the relay offline it shows the local rule texts as before.

## Alert voice
Pre-rendered ElevenLabs clips in `web/public/ai-voice/` (see `web/src/ai/README.md`, "Voice"). Without clips the browser's female Turkish voice is used.

## Chat request
`POST /api/ai/chat` takes `{ crewId, messages: [{role, text}] }` or the one-string shorthand of `docs/rehearsal.md`: `{ crewId, message: "…" }`.

## iOS / Watch
Listen to `/api/ai/stream?deviceId=…&crewId=…` and register as a device (contract §4). Delivery is marked by the server. Not done yet.

## Run the integrated version
`node --experimental-strip-types backend/ai/test-env.mjs` (see `docs/ai/TEST-ENV.md`).
