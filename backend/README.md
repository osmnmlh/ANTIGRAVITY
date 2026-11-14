# backend/ — optional relay (mock only)

One file, no dependencies, no database. Loads `shared/mock/*.json` into RAM on start (restart = reset to mock).
Status colors are computed with `web/src/domain/thresholds.ts` (same engine as the web dashboard).
**Every client must keep working without this server** — it is a live-demo bonus, not a requirement.

```bash
cd backend
cp .env.example .env      # optional: add GEMINI_API_KEY
npm start                 # = node --experimental-strip-types server.mjs  (Node 22.6+)
```

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, gemini, clients, simulation }` |
| GET | `/api/packets` | Packet bundle; each astronaut gets a computed `overallStatus` |
| GET | `/api/packets/:crewId` | One packet (the iPhone reads `aiGuidance` from here) |
| GET | `/api/samples?crewId=crew-1` | `HealthSample[]` history |
| POST | `/api/samples` | `HealthSample` or `HealthSample[]` → stored, packet `measurements` & `watchTelemetry.vitals` updated, pushed over SSE |
| GET | `/api/incidents` | 3 calibrated historical spaceflight incident simulations (`shared/mock/historical-incidents.json`) |
| GET | `/api/simulation` | Current simulation status + summary + available incidents |
| POST | `/api/simulation/live/start` | `{ crewId?, intervalMs? }` → starts periodic physiological telemetry simulation pushed over SSE |
| POST | `/api/simulation/incident/start` | `{ incidentId, crewId?, stepIntervalMs? }` → replays a historical accident phase-by-phase over SSE |
| POST | `/api/simulation/stop` | `{ reset? }` → stops active simulation and returns summary (`reset: true` restores pre-simulation baseline) |
| POST | `/api/simulation/reset` | Stops simulation and restores initial `shared/mock/*.json` data in RAM |
| POST | `/api/ai/guidance` | `{ "crewId": "crew-1" }` → Gemini (or fallback) → saved as `packet.aiGuidance`, pushed over SSE |
| GET | `/api/stream` | SSE: `hello` (`astronauts`, `simulation`), then `sample`, `packet`, and `simulation` on every change |

## AI guidance flow

Web button → `POST /api/ai/guidance` → server calls Gemini with the readings, their deterministic status and the
NASA HRP hazard context → result stored in the packet's `aiGuidance` field → iPhone reads the packet and shows it as
"AI recommendation". If there is no key, Gemini errors, times out (10 s) or returns a bad shape, the server builds the
text from the rule-based guidance (`source: "fallback"`). The AI never changes the green/amber/red status.

## Demo tips

- Safest: run the relay on the demo Mac; web and the iPhone **simulator** use `http://localhost:8787`.
- Real iPhone: same Wi-Fi as the Mac, use `http://<mac-ip>:8787` (venue Wi-Fi may block device-to-device traffic; use a phone hotspot).
- Quick check: `curl -X POST localhost:8787/api/samples -H 'content-type: application/json' -d '{"crewId":"crew-2","type":"spo2","value":88,"source":"watch"}'`
