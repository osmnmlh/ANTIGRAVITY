# Integrating the AI with the web and the relay

State on 2026-11-14. Nothing here needs a new dependency.

## Backend (relay): done, already on main except two lines

| What | Where | State |
| --- | --- | --- |
| AI module (alerts, cabin, chat, devices, ntfy, Gemini) | `backend/ai/`, wired in `server.mjs` (`createAi`, `ai.handle`, `ai.onSamples`) | on main |
| Gemini model | `server.mjs` default, `render.yaml`, `.env.example` = `gemini-flash-lite-latest` | on main |
| **Cabin values of an incident replay** | `ai.onCabinHint(phase.cabinHint)` in `startIncidentSimulation`, `ai.onCabinHint(null)` in `restoreSnapshotOrInitial` | **this PR: 2 lines in `server.mjs`** |

`onCabinHint` reads the text of an incident phase (`ppCO2: 8.2 mmHg · Kabin Sıcaklığı: 3.8 °C`, `Kontaminant: 14.5 ppm`, `Güç: Kısıtlı`)
into cabin readings (`backend/ai/cabin-hint.mjs`). What a phase does not state is nominal again. Three qualitative alarms use a fixed demo
value (`O2 Basınç Alarmı` = 17.9 kPa, `Ana Güç Düşüyor` = degraded). EVA suit pressure is not the cabin and is ignored.
Apollo 13 now raises: cabin O2 low, life-support power, cabin temperature low (new scenario `cabin-temperature`), CO2 high, and clears at the end.

## Web: needs the web team's branch on main first

`web/src/App.tsx` on main is still the single-view dashboard. The real one (astronaut selector, **Astronotlar / Ana üs** workspaces, backend
connection, live and incident simulation) is on `feat/web-body-hologram` and is not merged. The AI components mount into **that** file, so the
mount is a ready patch instead of an edit of someone else's unmerged file:

```bash
git merge origin/main                # in feat/web-body-hologram: brings backend/ai, web/src/ai, the shared data
git apply docs/ai/web-app-mount.patch
cd web && npm run build
```

| Place | What |
| --- | --- |
| root of `App` | `<AlertCenter>`: "Astronota git" selects the astronaut and opens **Astronotlar**; "AI'a sor" fills the chat |
| **Astronotlar** workspace | `<AiChat crewId={selectedCrewId} crewName=… />` |
| **Ana üs** workspace | `<AiChat />` (cabin + whole crew), `<DevicesPanel>` (connected phones), `<AiDemoControls>` (scenario buttons) |

The patch was applied and built (`tsc`, `vite build`) on `main` + the five web files of `feat/web-body-hologram`
(`web/.env.example`, `App.css`, `App.tsx`, `components/ThreeBodyMap.tsx`, `data/useHealthData.ts`). It adds 20 lines and changes none.
The web hook already talks to the relay (`/api/stream`, `POST /api/samples`, `/api/simulation/*`), so a value typed in the web form or produced by a
simulation reaches the AI rules and the alerts come back through `/api/ai/stream`.

Merge note for that branch: it also carries older copies of `shared/mock/*` and a different `backend/server.mjs`; take main's.
`web/src/domain/thresholds.ts` on main already has the `radiationBudgetMsv` parameter the web branch added.

## iOS
Listen to `/api/ai/stream?deviceId=…&crewId=…` and register as a device (contract §4). Delivery is marked by the server.

## How to run the integrated version
See `docs/ai/TEST-ENV.md` ("Integrated app").
