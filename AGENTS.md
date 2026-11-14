# AGENTS.md — single source of truth for every AI agent

> Claude Code, Antigravity (Gemini), Copilot, Cursor and any other agent: **this file is the rules.**
> `CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` only point here. Edit this file, not those.

## Project

**ANTIGRAVITY** — NASA Space Apps Challenge 2026: *Create Health Monitoring Software for Astronauts on Space Missions.*
Astronauts log and see health indicators (heart rate, blood pressure, SpO2, temperature, blood glucose, sleep, mood, radiation dose),
get a clear status (green / amber / red), and get plain-language guidance on what to do and when to call the flight surgeon.

- Full brief: `docs/Hackathon-Subject.md`
- Team: 6 people, ~24 hours to submission. **Ship a working demo, not an architecture.**

## Layout

```text
web/          Web dashboard (Vite + React + TypeScript). Main demo surface. Playwright e2e tests in web/e2e/
mobile/ios/   One Xcode project with the iPhone app (iPhone 16 Pro / iOS 18) AND the watchOS app, synced via WatchConnectivity
shared/       Data contract shared by all clients (health-sample JSON shape + mock data)
backend/      Optional zero-dependency Node relay (mock data in RAM, SSE, Gemini proxy). Clients must work without it
docs/         Challenge brief, notes, demo script
.agent/skills/   Canonical skills (Antigravity reads these directly)
.claude/skills/  Thin pointers to .agent/skills/ for Claude Code
```

Apple layout (one Xcode project, owned by the iOS/watchOS dev):

```text
mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat.xcodeproj      the project (iOS + watchOS targets)
mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Antigravity_iOS/   iPhone app sources (App, Views, ViewModels, Components)
mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Antigravity_watchOS/   watchOS app sources (App, Managers, Notifications)
mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/          code shared by both targets (services, protocols, extensions)
mobile/ios/Shared/   HealthModels.swift + Thresholds.swift: the Swift data contract and status engine; add both to both targets
```

The Xcode project uses synchronized folders, so new files inside `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/` join the targets automatically.
`watch/` only holds a pointer README; do not put watch code there.

## Skills (read the matching one before starting a task)

| Skill | Use when |
| --- | --- |
| `astronaut-health-domain` | Anything about indicators, thresholds, status colors, guidance text |
| `web-dashboard` | Building UI in `web/` |
| `watchos-app` | Anything in the watchOS target (`Antigravity_watchOS/`) |
| `ios-watch-connectivity` | iPhone app or iPhone <-> Watch data sync |
| `playwright-e2e` | Writing/running browser tests for `web/` |
| `team-git-workflow` | Branching, commits, PRs, merge conflicts |
| `hackathon-demo` | Scoping, cutting features, demo script, submission |

Canonical files: `.agent/skills/<name>/SKILL.md`.

## Data contract (all clients use this shape)

```json
{ "id": "uuid", "crewId": "crew-1", "type": "heartRate", "value": 72, "unit": "bpm",
  "timestamp": "2026-11-14T08:00:00Z", "source": "watch" }
```

`type` ∈ `heartRate | bloodPressureSys | bloodPressureDia | spo2 | bodyTemp | bloodGlucose | sleepHours | mood | radiationDose`.
`source` ∈ `watch | iphone | manual | mock`. Change it only via a PR touching `shared/` and tell the team.

Two files in `shared/mock/` use this contract:

- `samples.json` — `HealthSample[]` history (one record per reading, shape above). Feeds charts.
- `astronaut-packets.json` — one **packet per astronaut**: profile + mission + latest `measurements` + Apple Watch `watchTelemetry` + `aiGuidance`.
  `astronautId` in a packet equals `crewId` in samples. Types: `web/src/domain/types.ts`, `mobile/ios/Shared/HealthModels.swift`.
- `aiGuidance` = `{ generatedAt, source: "gemini"|"fallback", model, overallStatus, summary, actions[], escalate, disclaimer }`.
  Only the backend writes it (Gemini key stays server-side). iPhone parses it and shows it as **"AI recommendation"**.
  `overallStatus` comes from the threshold engine — **the AI never decides green/amber/red**.

Status logic (thresholds → green/amber/red) lives in one place per platform and follows `astronaut-health-domain`.

## How to work

1. **Small and done beats big and almost.** No new framework, backend, auth or database unless the team agreed. Mock data is fine.
2. Stay inside your folder (`web/`, `mobile/ios/`, `backend/`). Touching `shared/` or root files = mention it in the PR.
3. Verify before claiming done: run it (`npm run dev` / `npm test` / build in Xcode) and say what you checked.
4. Branch `feat/<area>-<short>` (e.g. `feat/web-body-map`), small PRs into `main`, never force-push `main`. See `team-git-workflow`.
5. Never commit secrets, real personal health data, `node_modules/`, `DerivedData/`.
6. Health content: plain language, always say *why* a measurement matters and *when* to contact the flight surgeon. This is a demo, not a medical device — say so in the UI.
7. Code, comments, commits and docs in **English**. Talk to team members in their language.

## Commands

```bash
# web
cd web && npm install && npm run dev        # local dev
cd web && npx playwright test               # e2e
cd backend && node --experimental-strip-types server.mjs   # optional relay on :8787 (Node 22.6+)
# iOS / watchOS: open mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat.xcodeproj in Xcode 16+, pick the iOS or watchOS scheme, Run
```
