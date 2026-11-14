# backend/ — optional relay (mock only)

One file, no dependencies, no database. Loads `shared/mock/*.json` into RAM on start (restart = reset to mock).
Status colors are computed with `web/src/domain/thresholds.ts` (same engine as the web dashboard).
**Every client must keep working without this server** — it is a live-demo bonus, not a requirement.

```bash
cd backend
cp .env.example .env      # optional: add GEMINI_API_KEY
npm start                 # = node --experimental-strip-types server.mjs  (Node 22.6+)
npm test                  # AI module tests
```

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, gemini, model, geminiLastError, clients, ai, simulation }` |
| GET | `/api/packets` | Packet bundle; each astronaut gets a computed `overallStatus` |
| GET | `/api/packets/:crewId` | One packet (the iPhone reads `aiGuidance` from here) |
| GET | `/api/samples?crewId=crew-1` | `HealthSample[]` history |
| POST | `/api/samples` | `HealthSample` or `HealthSample[]` → stored, packet `measurements` & `watchTelemetry.vitals` updated, pushed over SSE |
| GET | `/api/incidents` | 3 calibrated historical spaceflight incident simulations (`shared/mock/historical-incidents.json`) |
| GET | `/api/simulation` | Current simulation status + summary + available incidents |
| POST | `/api/simulation/live/start` | `{ crewId?, intervalMs? }` → starts periodic physiological telemetry simulation pushed over SSE |
| POST | `/api/simulation/incident/start` | `{ incidentId, crewId?, stepIntervalMs? }` → replays a historical accident phase-by-phase over SSE; each phase runs the AI rules, so alerts reach the web and phones |
| POST | `/api/simulation/stop` | `{ reset? }` → stops active simulation and returns summary (`reset: true` restores pre-simulation baseline) |
| POST | `/api/simulation/reset` | Same as `/api/demo/reset` |
| POST | `/api/ai/guidance` | `{ "crewId": "crew-1" }` → Gemini (or fallback) → saved as `packet.aiGuidance`, pushed over SSE |
| GET | `/api/stream` | SSE: `hello` (`astronauts`, `simulation`), then `sample`, `packet`, and `simulation` on every change |
| POST | `/api/demo/reset` | Rehearsal reset: stop any simulation, reload `shared/mock/*.json` (like a restart), reset AI alerts/cabin; SSE sends `hello` |
| * | `/api/ai/*` | AI module (`backend/ai/`, ADR-0007): alerts, cabin, devices, `/api/ai/chat`, `/api/ai/stream`, `/api/ai/demo/:id`. See [`ai/README.md`](ai/README.md) |

Every request is logged as `[http] METHOD /path status ms`; alerts as `[ai] ALERT ...`.

**Limits (loose, per IP per minute):** `POST /api/ai/guidance` + `/api/ai/chat` 30 (`RATE_AI_PER_MIN`), everything else 600
(`RATE_ALL_PER_MIN`); over the limit = `429` with `retry-after`, clients fall back silently. `/api/health` is never limited
or logged (Render polls it). A request must arrive within 15 s; SSE streams stay open.

## AI guidance flow

Web button → `POST /api/ai/guidance` → server calls Gemini with the readings, their deterministic status and the
NASA HRP hazard context → result stored in the packet's `aiGuidance` field → iPhone reads the packet and shows it as
"AI recommendation". If there is no key, Gemini errors, times out (10 s) or returns a bad shape, the server builds the
text from the rule-based guidance (`source: "fallback"`). The AI never changes the green/amber/red status.

## Gemini key (team decision)

One key, server-side only: Render's Environment tab, plus `backend/.env` on the Plan B laptop (git-ignored, never in a commit, chat or the frontend).
Check it (locally or with the Render URL instead of `localhost:8787`):

```bash
curl -s localhost:8787/api/health                       # "gemini": true
curl -s -X POST localhost:8787/api/ai/guidance -d '{"crewId":"crew-1"}' | grep -o '"source":"[a-z]*"'   # "source":"gemini"
```

`"source":"fallback"` means the key is missing or Gemini failed; the terminal shows `[ai] Gemini failed ...` with the reason.

## Hosting (ADR-0006: web on Vercel, relay on Render)

1. Render → **New → Blueprint** → this repo. `render.yaml` creates `antigravity-backend` (free, Node 22, deploys `main`).
2. In the service's **Environment** tab set `GEMINI_API_KEY`. The key lives only there (and in a local `backend/.env` for Plan B).
3. Use the service URL (`https://antigravity-backend-xxxx.onrender.com`) everywhere:
   - Vercel: env var `VITE_API_URL=<url>`, then redeploy the web.
   - iPhones: the base URL constant in the app (HTTPS, so no ATS exception needed).
4. Before the demo: open `<url>/api/health` (free Render sleeps after 15 min idle, first request ~50 s), then `POST <url>/api/demo/reset`.

Plan B (no internet or Render down): `npm start` on one laptop (Windows or Mac) on a phone hotspot, clients use `http://<laptop-ip>:8787`.

## Demo tips

- Safest: run the relay on the demo Mac; web and the iPhone **simulator** use `http://localhost:8787`.
- Real iPhone: same Wi-Fi as the Mac, use `http://<mac-ip>:8787` (venue Wi-Fi may block device-to-device traffic; use a phone hotspot).
- Quick check: `curl -X POST localhost:8787/api/samples -H 'content-type: application/json' -d '{"crewId":"crew-2","type":"spo2","value":88,"source":"watch"}'`
