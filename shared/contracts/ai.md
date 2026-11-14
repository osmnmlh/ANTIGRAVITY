# AI contract: cabin, alerts, devices, chat

Status: **proposed** (ADR-0007). Shapes used by the backend AI module (`backend/ai/`), the web (`web/src/ai/` + cockpit view)
and the iPhone app. Examples live in [`examples/`](examples/). Health samples and packets keep the AGENTS.md contract unchanged.

All routes are under `/api/ai/` on the existing relay (default `http://<mac-ip>:8787`). All JSON, all timestamps ISO-8601 UTC.
Clients must keep working when the backend is off (show "AI offline", fall back to `examples/`).

## 1. Cabin snapshot

`GET /api/ai/cabin` → `CabinSnapshot` (also pushed as SSE event `cabin` on every change).

```ts
type CabinMetric = 'ppO2' | 'ppCO2' | 'pressure' | 'temperature' | 'humidity' | 'contaminant' | 'radiationRate' | 'lifeSupportPower';
type Status = 'green' | 'amber' | 'red';

interface CabinReading {
  metric: CabinMetric;
  value: number | string;   // string only for lifeSupportPower: 'nominal' | 'degraded' | 'fault'
  unit: string;             // '' for lifeSupportPower
  status: Status;           // computed by the backend from the table below; clients never recompute
  timestamp: string;
  label?: string;           // contaminant only, e.g. 'ammonia'
}

interface CabinSnapshot {
  module: string;           // e.g. 'Ares-IV crew cabin'
  crewIds: string[];        // who is inside this cabin; cabin alerts go to these crew (demo: one cabin, crew-1 + crew-2)
  overallStatus: Status;    // worst reading
  readings: CabinReading[];
  updatedAt: string;
}
```

`POST /api/ai/cabin` with `{ "readings": [{ "metric": "ppO2", "value": 17.2 }] }` updates readings (unit/status filled by the
server), re-runs the scenario rules and returns the new snapshot.

### Cabin demo thresholds (demo values loosely based on ISS cabin ranges, not engineering limits)

| metric | unit | green | amber | red |
| --- | --- | --- | --- | --- |
| ppO2 | kPa | 19.5–23.1 | 18.0–19.4 or 23.2–25.0 | < 18.0 or > 25.0 |
| ppCO2 | mmHg | < 3.0 | 3.0–5.9 | ≥ 6.0 |
| pressure | kPa | 97–103 | 90–96.9 or 103.1–105 | < 90 or > 105 |
| temperature | °C | 18–27 | 15–17.9 or 27.1–30 | < 15 or > 30 |
| humidity | % | 25–70 | 15–24 or 71–80 | < 15 or > 80 |
| contaminant (ammonia) | ppm | < 1 | 1–9.9 | ≥ 10 |
| radiationRate | mSv/day | < 1.0 | 1.0–4.9 | ≥ 5.0 (solar particle event) |
| lifeSupportPower | — | nominal | degraded | fault |

## 2. Alert

```ts
interface AlertMetric { kind: 'cabin' | 'vital'; crewId?: string; type: string; value: number | string; unit: string; status: Status }

interface AlertAdvice {
  why: string;              // why it matters in space (links to a NASA HRP hazard)
  doNow: string[];          // 1–3 concrete actions
  escalate: string;         // when to call the crew medical officer / flight surgeon
  source: 'gemini' | 'fallback';
  model: string | null;
  generatedAt: string;
}

interface AlertDelivery { deviceId: string; crewId: string; deliveredAt: string | null; ackedAt: string | null }

interface Alert {
  id: string;
  scope: 'cabin' | 'crew';  // routing is always by crewIds: every device registered to one of them gets the alert
  crewIds: string[];        // affected astronauts (cabin: CabinSnapshot.crewIds)
  severity: 'amber' | 'red';
  scenarioId: string;       // see docs/ai/ROADMAP.md, e.g. 'cabin-gas-leak', 'orthostatic'
  hazardId: string;         // id from shared/mock/nasa-hazards.json
  title: string;            // short, deterministic, available instantly
  spokenText: string;       // what the voice says (deterministic)
  metrics: AlertMetric[];   // the readings that fired the rule
  advice: AlertAdvice | null; // null until Gemini/fallback answers, then sent as `alert-update`
  deliveries: AlertDelivery[];
  cockpitAckedAt: string | null; // set when mission control (web) acknowledges
  state: 'active' | 'resolved';
  createdAt: string;
  updatedAt: string;
  disclaimer: string;       // 'Yapay zekâ önerisidir. Demo yazılımıdır, tıbbi cihaz değildir.'
}
```

Rules: alerts fire only on a **status transition** (green→amber, →red), one per scenario + scope + crew with a 5-minute
cooldown; `resolved` when all its metrics are back to green. The AI never sets `severity`; the rules do.

| Method | Path | Body → Response |
| --- | --- | --- |
| GET | `/api/ai/alerts?crewId=crew-1&state=active` | → `Alert[]` (crewId filter includes cabin alerts) |
| POST | `/api/ai/alerts/:id/delivered` | `{ deviceId }` → `Alert` |
| POST | `/api/ai/alerts/:id/ack` | `{ deviceId }` (phone) or `{ by: "cockpit" }` (web) → `Alert` |

## 3. Devices (phones)

| Method | Path | Body → Response |
| --- | --- | --- |
| POST | `/api/ai/devices` | `{ deviceId, crewId, platform: "ios", name? }` → `{ ok: true }` (idempotent; call on every app start) |
| GET | `/api/ai/devices` | → `[{ deviceId, crewId, platform, name, online, lastSeen }]` |

`deviceId` = a UUID the app generates once and stores. Any number of devices; several per crewId is fine.

## 4. Stream

`GET /api/ai/stream?deviceId=…&crewId=…` (Server-Sent Events). Without query params (web cockpit) it receives everything.
With `crewId` it receives that astronaut's alerts plus all cabin alerts. A connected `deviceId` counts as `online`.

| event | data |
| --- | --- |
| `hello` | `{ cabin: CabinSnapshot, alerts: Alert[] }` (active ones). Sent on connect **and again after a demo reset**: replace all state |
| `cabin` | `CabinSnapshot` |
| `alert` | `Alert` (new: notify, beep, speak, popup) |
| `alert-update` | `Alert` (advice arrived, delivery/ack changed, resolved: replace by `id`, do **not** re-notify) |

## 5. Chat

`POST /api/ai/chat`

```json
{ "scope": "crew", "crewId": "crew-1", "messages": [{ "role": "user", "text": "Astronotun şu anki durumu nasıl?" }] }
```

`scope: "cabin"` = cockpit context (cabin + whole crew); `scope: "crew"` needs `crewId`. History stays in the browser; send the
last ≤ 6 turns, each `text` ≤ 500 chars. Empty `messages` = **briefing** (short opening summary).

```json
{ "reply": "…", "source": "gemini", "escalation": "flightSurgeon",
  "indicators": ["spo2"], "suggestions": ["Şimdi ne yapmalı?", "Sebep kabin havası olabilir mi?"],
  "disclaimer": "Yapay zekâ önerisidir. Demo yazılımıdır, tıbbi cihaz değildir." }
```

`escalation` ∈ `none | cmo | flightSurgeon`; if any related status is red it is never `none`. Always HTTP 200 with
`source: "fallback"` when there is no key, a timeout or an error. Answers are Turkish (the model switches only if the user clearly writes in another language).

## 6. Demo triggers (rehearsal and stage)

| Method | Path | Effect |
| --- | --- | --- |
| POST | `/api/ai/demo/:scenarioId` | Pushes the readings that fire that scenario (e.g. `cabin-gas-leak`) |
| GET | `/api/ai/demo` | `string[]` of scenario ids (for demo buttons) |
| POST | `/api/ai/demo/reset` | Cabin back to nominal, demo vitals restored, alerts cleared, devices kept |

Problems already present at start or after a reset are sent as `alert-update` (listed, not announced).

## 7. Health

`GET /api/ai/health` → `{ ok, cabin: Status, activeAlerts, devices, streams }`. The web uses it to show "AI live / AI offline".

## 8. Fit with the existing contract (read before coding)

- **Crew rules reuse the one status engine** (ADR-0001): vital status and multi-day trends come from
  `web/src/domain/thresholds.ts` (`getStatus`, `getTrendStatus`), which `backend/server.mjs` already imports.
  `backend/ai/` must import it too, never copy thresholds. `fatigue-isolation` ("2 days") uses the trend rule, not a new one.
  Only the **cabin** thresholds above are new, and they live in `backend/ai/` (one place, backend only).
- **`Alert.advice` vs `aiGuidance`**: the packet's `aiGuidance` (AGENTS.md) stays the per-astronaut "AI recommendation"
  on the iPhone and is not replaced. `Alert.advice` is per alert. Both follow the same rule: the AI writes words, never colors.
- **Existing routes stay as they are**: `/api/stream`, `/api/packets`, `/api/samples`, `/api/ai/guidance`. The cockpit may open
  both `/api/stream` (vitals) and `/api/ai/stream` (cabin + alerts).
- **Chat minimum = issue #12**: `{ crewId, messages }` with no `scope` means `scope: "crew"`; `{ reply, source }` is the
  minimum response, the other fields are optional for clients.
- **iPhone notes**: the stream only runs while the app is in the foreground (`URLSession.bytes(for:)` + `.lines`, reconnect
  on drop). Plain `http://<mac-ip>:8787` on a real device needs `NSAllowsLocalNetworking` (ATS) and an
  `NSLocalNetworkUsageDescription` in the target's Info settings. Store `deviceId` once in `UserDefaults`.
- **Language**: the team chose **Turkish for every user-facing text** (web, iPhone, AI). `title`, `spokenText`, `advice`,
  `disclaimer` and chat replies are Turkish; `spokenText` spells units out for a `tr-TR` voice. Field names and ids stay English.
