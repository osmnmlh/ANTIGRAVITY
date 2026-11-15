# backend/ai: plug-and-play AI module

Proactive alerts (no prompt needed), cabin monitoring and alert fan-out to every crew phone.
Zero dependencies. It never imports the host server: everything comes in through `createAi(deps)`.
API shapes: [`shared/contracts/ai.md`](../../shared/contracts/ai.md). Plan: [`docs/ai/ROADMAP.md`](../../docs/ai/ROADMAP.md).

| File | What |
| --- | --- |
| `index.mjs` | `createAi(deps)` → `{ handle, onSamples, cabin, alerts, devices }`, routes, demo triggers |
| `cabin.mjs` | Cabin state + demo cabin thresholds (status computed here, clients only render it) |
| `rules.mjs` | Scenario rules: when an alert fires, how severe, deterministic fallback advice |
| `chat.mjs` | `POST /api/ai/chat` (#12): facts from the rules engine → Gemini, or a deterministic Turkish answer |
| `advice.mjs` | Gemini interprets a freshly detected alert (`advice.summary`, reworded why / doNow / escalate); rejects unsafe or malformed output |
| `gemini.mjs` | the one shared Gemini call (retry on 503/429, one deadline); default model `gemini-flash-lite-latest` |
| `safety.mjs` | shared medication check |
| `ntfy.mjs` | optional push for locked phones (`NTFY_TOPIC`), off by default |
| `test-env.mjs` | one command: relay + web + printed phone links, see `docs/ai/TEST-ENV.md` |
| `guidance.mjs` | `packet.aiGuidance` of every astronaut: summary, steps and, per indicator, the four texts of the iPhone guidance sheet. Turkish rules first, Gemini's version a moment later; regenerated only when a status or the active alerts change |
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
curl localhost:8788/api/ai/scenario                          # the playing scenario with its live values (SSE `scenario`), see docs/scenario-live-sync.md
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
import { guidanceByType } from '../web/src/domain/guidance.ts';   // Turkish guidance texts
import { metricDefinitions } from '../web/src/domain/types.ts';  // Turkish labels
// getStatus, getTrendStatus come from thresholds.ts, already imported by server.mjs

const ai = createAi({
  getPackets: () => bundle.astronauts,
  getVitalStatus: (type, value, packet) => getStatus(type, value, packet.mission?.radiationBudgetMsv),
  getVitalGuidance: (type) => guidanceByType[type],
  getTrendStatus: (crewId, type) => getTrendStatus(samples.filter((s) => s.crewId === crewId), type),
  vitalLabel: (type) => metricDefinitions[type]?.label ?? type,
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
| `getVitalGuidance(type, status)` | no | Turkish `{ why, doNow[], escalate }` (`guidanceByType`) for the generic "vital red" advice |
| `getTrendStatus(crewId, type)` | no | shared multi-day trend rule; used by `fatigue-isolation` (2 days at mood ≤ 3) |
| `vitalLabel(type)` | no | Turkish label (`metricDefinitions[type].label`) for titles and speech |
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
- All user-facing text is Turkish (team decision). Spoken text spells units out ("milyonda 14", "yüzde 89") for a `tr-TR` voice.
- **Two steps per alert:** the rules announce it instantly (deterministic title, speech and advice); about 1.5 s later Gemini's
  interpretation arrives as `alert-update` (`advice.source: "gemini"` + `summary`). Severity and the spoken text never change.
  No key, error or rejected output → the rule-based advice simply stays.
- **Phones:** every phone whose stream receives the alert is marked delivered at that moment; a `devices` event keeps the cockpit's
  "who is online" live; adding a phone needs no code change.
- **ntfy** (optional): `NTFY_TOPIC` in `backend/.env` also pushes to locked phones, one topic per astronaut (`<topic>-crew-1`).
  The relay needs no change: the module reads the env var itself.
- Every alert carries deterministic advice (`source: "fallback"`); Gemini rewording comes in phase 3.
