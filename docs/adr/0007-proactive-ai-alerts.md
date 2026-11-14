# 0007. Proactive AI alerts, cabin monitoring and phone fan-out

- Status: Proposed
- Date: 2026-11-14
- Affects: AI (GoktugFerdi), backend (osmnmlh), web (Ahmetzkn, Omerozcan71), iOS

## Context
The product flow agreed with the web team: the web has a **cockpit view** (cabin environment: O2, CO2, pressure,
temperature, humidity, gas, radiation, life-support power + all crew status) and an **astronaut detail view**.
Each astronaut sees only themselves on their iPhone. The AI should not wait for a question: when a reading crosses a
limit it must speak, show a popup, and push the alert to every affected phone at the same time (2 iPhones on stage,
more later). ADR-0003 covers the chat; this ADR covers everything proactive.

## Options
**Where detection runs**
1. **Backend** (`backend/ai/`, called from `server.mjs`). + one place, works when no browser is open, phones get the same alert. − needs 2 integration lines in `server.mjs`.
2. Each client detects on its own. − three copies of the rules, phones and web disagree.

**How phones get alerts**
- a) **SSE + local notification** in the app. + no Apple paid account, ~zero setup. − app must be open.
- b) APNs push. + works on locked phones. − paid Apple account, keys, JWT signing; risky in 24 h.
- c) ntfy.sh as an extra channel. + locked phones, 30 min work. − notification comes from the ntfy app.

**How alert text is produced**
- i) Gemini only. − 2–10 s delay before a critical alert, nothing without a key.
- ii) **Deterministic title + spoken text immediately, Gemini advice appended later** via `alert-update`.

## Recommendation
1 + a (c optional, b later if an account exists) + ii.
Phones register (`deviceId`, `crewId`); cabin alerts go to every device, crew alerts only to that astronaut's devices,
so adding a phone needs no code. Phones report `delivered` and `ack`; the cockpit shows "📱 2/2 · ✅ 1".
All AI code lives in new folders (`backend/ai/`, `web/src/ai/`); owners add the few integration lines.
Cabin thresholds are demo values defined in `shared/contracts/ai.md`; the backend computes cabin status, clients only render it.

## Decision
_To be filled by the team._
