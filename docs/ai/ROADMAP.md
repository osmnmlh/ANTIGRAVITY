# AI roadmap (owner: GoktugFerdi)

Covers issues #12 (backend AI chat) and #13 (web AI chat) plus the agreed extra scope:
proactive alerts with voice + popup, cockpit (cabin) monitoring, and alert fan-out to every crew phone.
Contract: [`shared/contracts/ai.md`](../../shared/contracts/ai.md). Decision record: [ADR-0007](../adr/0007-proactive-ai-alerts.md).

## What the AI does

| # | Job | Where it shows |
| --- | --- | --- |
| 1 | **Proactive alert**: detects a problem without anyone asking, speaks it and opens a popup | Web cockpit (voice + popup), every crew phone |
| 2 | **Correlation**: reads cabin + crew together ("3 crew SpO2 drops + low cabin O2 → root cause is the cabin") | Cockpit, astronaut detail |
| 3 | **Advice & chat**: what to do now, why, when to call the flight surgeon | Popup, advice card, chat panel |

The threshold engine decides green/amber/red and which scenario fired. The AI only writes the words.
Every alert works without Gemini (deterministic text first, AI advice added a few seconds later).

## No-conflict rule

All AI code lives in **new folders only**: `backend/ai/` and `web/src/ai/`. Nobody else's file is edited.
Integration needs a few lines in files owned by others; the owners add them (see *Integration points*).

## Phases

| Phase | Deliverable | Done when |
| --- | --- | --- |
| **0. Contract** (this PR) | Roadmap, ADR-0007, `shared/contracts/ai.md` + JSON examples | Team has reviewed shapes; web/iOS can build against the examples |
| **1. Backend monitor** (`backend/ai/`) | Cabin state + cabin thresholds, scenario rules, alert store, device registry, fan-out, `/api/ai/*` routes, `/api/ai/stream`, demo triggers. **No Gemini yet** | `curl` a demo scenario → alert appears on `/api/ai/stream` filtered per device; ack round-trips |
| **2. Web alerting** (`web/src/ai/`) | `AlertCenter` (popup, beep, speech, voice toggle, "Open astronaut"), delivery/ack badge "📱 2/2 · ✅ 1" | Trigger scenario → cockpit beeps, speaks, shows popup; works with backend off (clear "AI offline") |
| **3. Gemini** | Advice enrichment (`alert-update`), `POST /api/ai/chat` (#12), correlation wording, briefing (empty `messages`) | Real key tested once; no key / timeout → fallback, HTTP 200 |
| **4. Web chat** | `AiChat` panel (#13): `scope="cabin"` in cockpit, `crewId` in detail view; quick-question chips; source badge; per-crew history | Ask → answer; switching astronaut switches context; `npm run build` passes |
| **5. Polish** | `AiSummaryCard` (cockpit brief), optional ntfy.sh channel, Playwright smoke test, demo script lines | Two-phone rehearsal on the demo hotspot passes |

Phases 1 and 2 can run in parallel once the contract is merged (web codes against `shared/contracts/examples/`).

## Scenarios (first pass: ⭐ = demo must-have)

| id | Scope | Trigger (demo rule) | NASA hazard |
| --- | --- | --- | --- |
| ⭐ `cabin-o2-low` | cabin | ppO2 red | Hostile/Closed |
| ⭐ `cabin-gas-leak` | cabin | contaminant red (ammonia) | Hostile/Closed |
| `cabin-co2-high` | cabin | ppCO2 amber/red | Hostile/Closed |
| `cabin-pressure-drop` | cabin | pressure red or falling fast | Hostile/Closed |
| ⭐ `solar-event` | cabin | radiation dose rate red | Space Radiation |
| `power-life-support` | cabin | life-support power `fault` | Hostile/Closed |
| ⭐ `cabin-hypoxia` | cabin + crew | cabin O2 amber/red **and** ≥ 2 crew SpO2 < 94 | Hostile/Closed |
| ⭐ `orthostatic` | crew | systolic < 90 **and** HR > 100 | Gravity Fields |
| `infection-suspected` | crew | temp ≥ 37.6 **and** HR > 100 | Hostile/Closed (immune) |
| `individual-hypoxia` | crew | SpO2 red while cabin O2 green | Hostile/Closed |
| `fatigue-isolation` | crew | sleep < 6 h **and** mood ≤ 3, 2 days | Isolation & Confinement |
| `vital-red` | crew | any single vital turns red (catch-all) | per indicator |

Every popup also reminds the crew that a Mars comms delay can be up to 20 minutes ("Distance from Earth").

## Integration points (owners add these; AI side ships the module)

| File | Owner | Change |
| --- | --- | --- |
| `backend/server.mjs` | osmnmlh | `import { createAi } from './ai/index.mjs'`; before the 404: `if (await ai.handle(req, res, url)) return;`; after a sample POST: `ai.onSamples(touchedCrewIds)` |
| `web/src/App.tsx` | web team | Mount `<AlertCenter onOpenAstronaut={...} />` once at top level; `<AiChat scope="cabin" />` in the cockpit view, `<AiChat crewId={id} />` in the detail view |
| iPhone app | iOS team | Register device, listen to `/api/ai/stream?deviceId&crewId`, show notification, post `delivered` / `ack` |
| Cockpit cabin tiles | web team | Read `GET /api/ai/cabin` (or `cabin` SSE event); status colors come precomputed |

## Risks

- **Network on stage**: phones must reach the Mac. Use one personal hotspot for Mac + phones; rehearse with real devices.
- **Gemini latency/outage**: deterministic alert is spoken first; advice is optional.
- **Browser autoplay**: speech needs one user click, hence the "🔊 Voice alerts" toggle.
- **Locked phones**: SSE + local notification needs the app open. Optional ntfy.sh channel covers locked screens; APNs only if someone has a paid Apple Developer account.

## 24-hour cut line

Issues #12 and #13 are the assigned work, so the chat must not be the part that gets dropped.

| Must ship for the demo | Only if time is left |
| --- | --- |
| Phase 1 with the ⭐ scenarios, `/api/ai/stream`, demo triggers + reset, device registration | Other scenarios, `GET /api/ai/devices` list |
| Phase 2 popup + voice + "AI offline" state | Delivery/ack badge "📱 2/2 · ✅ 1" |
| `POST /api/ai/chat` with fallback (#12) and the `AiChat` panel (#13) | Gemini advice via `alert-update`, briefing, `AiSummaryCard` |
| iPhone: register + listen + local notification | ntfy.sh, APNs |

If the clock runs short, build the #12/#13 chat with fallback before Phase 2 polish.
