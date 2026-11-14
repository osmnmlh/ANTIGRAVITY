# backend/ai: plug-and-play AI module

Proactive alerts (no prompt needed), cabin monitoring and alert fan-out to every crew phone.
Zero dependencies. It never imports the host server: everything comes in through `createAi(deps)`.
API shapes: [`shared/contracts/ai.md`](../../shared/contracts/ai.md). Plan: [`docs/ai/ROADMAP.md`](../../docs/ai/ROADMAP.md).

| File | What |
| --- | --- |
| `index.mjs` | `createAi(deps)` → `{ handle, onSamples, cabin, alerts, devices }`, routes, demo triggers |
| `cabin.mjs` | Cabin state + demo cabin thresholds (status computed here, clients only render it) |
| `rules.mjs` | Scenario rules: when an alert fires, how severe, deterministic fallback advice |
| `chat.mjs` | `POST /api/ai/chat` (#12): facts from the rules engine → Gemini, or a deterministic EN/TR answer |
| `alerts.mjs` | Alert store (transitions, 5 min cooldown, deliveries/acks), device registry, filtered SSE hub |
| `dev-server.mjs` | Runs the module alone on `:8788` with `shared/mock`, also the reference adapter |
| `ai.test.mjs` | `node:test` suite |

## Run it alone (no team backend needed)

```bash
node --experimental-strip-types backend/ai/dev-server.mjs          # http://localhost:8788
node --experimental-strip-types --test backend/ai/ai.test.mjs      # tests
```

```bash
curl -X POST localhost:8788/api/ai/demo/cabin-gas-leak       # fire a scenario (list: GET /api/ai/demo)
curl -N "localhost:8788/api/ai/stream?deviceId=phone-a&crewId=crew-1"   # what a phone receives
curl localhost:8788/api/ai/alerts?state=active
curl -X POST localhost:8788/api/ai/demo/reset
curl -X POST localhost:8788/api/samples -H 'content-type: application/json' \
  -d '{"crewId":"crew-2","type":"bodyTemp","value":39.1}'      # a normal sample also triggers rules
```

## Plug it into the relay (`backend/server.mjs`)

Three additions, nothing else changes. If the relay's internals differ, only the `deps` block needs adapting.

```js
import { createAi } from './ai/index.mjs';

const ai = createAi({
  getPackets: () => bundle.astronauts,
  getVitalStatus: (type, value, packet) => getStatus(type, value, packet.mission?.radiationBudgetMsv),
  getVitalGuidance: getGuidance,
  getTrendStatus: (crewId, type) => getTrendStatus(samples.filter((s) => s.crewId === crewId), type),
  vitalLabel: (type) => INDICATOR_META[type]?.label ?? type,
  hazards,
  applySamples: (list) => addSamples(list),   // lets vital demo scenarios write samples
  gemini: { apiKey: GEMINI_API_KEY, model: GEMINI_MODEL },
});

// in the request handler, after CORS/OPTIONS and before the 404:
if (await ai.handle(req, res, url)) return;

// in POST /api/samples, after addSamples(...):
ai.onSamples();
```

`handle` only answers its own `/api/ai/*` routes and returns `false` for everything else
(including the relay's `/api/ai/guidance`). The relay keeps doing CORS.

## deps

| dep | required | purpose |
| --- | --- | --- |
| `getPackets()` | yes | live astronaut packets (`shared/mock/astronaut-packets.json` shape) |
| `getVitalStatus(type, value, packet)` | yes | the platform's threshold engine; the module never has its own vital thresholds |
| `getVitalGuidance(type, status)` | no | `{ whyInSpace, doNow[], escalateWhen }` for the generic "vital red" advice |
| `getTrendStatus(crewId, type)` | no | shared multi-day trend rule; used by `fatigue-isolation` (2 days at mood ≤ 3) |
| `vitalLabel(type)` | no | human label for spoken text |
| `hazards` | no | NASA HRP hazards, maps an indicator to a `hazardId` |
| `applySamples(samples)` | no | needed only by vital demo scenarios (`orthostatic`, …) |
| `gemini` | no | `{ apiKey, model }` for chat; key stays on the server. Without it chat answers deterministically |
| `cabinCrewIds` | no | who is inside the cabin; default = crew sharing the first packet's mission |
| `now`, `log`, `cooldownMs` | no | for tests |

## Behaviour worth knowing

- Alerts fire on **status transitions** only. Same problem + new numbers = quiet `alert-update`. Amber → red = new alert.
- A cleared problem is `resolved`; if it comes back within 5 minutes at the same or lower severity it is not re-announced.
- Problems already present at start (or after `demo/reset`) are listed silently (sent as `alert-update`), not announced.
- `cabin-hypoxia` (cabin O2 low + ≥ 2 crew SpO2 < 94) replaces the separate cabin-O2 and per-person SpO2 alerts.
- Chat: the model gets the computed statuses as final facts; its `escalation` can never be lower than the deterministic one.
  Key in `backend/.env` (`GEMINI_API_KEY`), read by `dev-server.mjs` too. No key, timeout or bad JSON → `source: "fallback"`, HTTP 200.
- Every alert carries deterministic advice (`source: "fallback"`); Gemini rewording comes in phase 3.
