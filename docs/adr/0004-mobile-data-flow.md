# 0004. iPhone / Watch data flow

- Status: Accepted
- Date: 2026-11-14
- Affects: iOS + watchOS (Skylowerr), backend (osmnmlh), shared (Mehmetson01)

## Context
Swift models exist in `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/Models/` (PR #2/#3). The iPhone must show "AI recommendation" from `aiGuidance`.
Real HealthKit on a real Watch is slow to set up and fragile on stage; the simulator has no heart rate.

## Options
**Where the iPhone gets packets**
1. Bundled `astronaut-packets.json` only. + always works. − `aiGuidance` is frozen mock text.
2. Backend `GET /api/packets/:crewId` (pull-to-refresh or every ~10 s), fallback to the bundled JSON. + live AI text. − needs the relay reachable.

**Watch data**
- a) Real HealthKit heart rate on a real Watch.
- b) Mock provider (simulator) behind the same protocol, real HealthKit only if time allows.

**Does the iPhone forward Watch samples to the backend (`POST /api/samples`)?**
- yes → web updates live during the demo (nice "wrist → phone → mission control" moment); no → simpler.

## Recommendation
2 + b, and forward samples only as a stretch goal. Every screen must still work in airplane mode with bundled data.
Simulator talks to `http://localhost:8787`; a real device needs the Mac's IP (see `backend/README.md`). _(Superseded by the Decision below: everyone uses the Render URL.)_

## Decision
Accepted (2026-11-14, osmnmlh): **2 + forward samples.** Two real iPhones each show one astronaut and read
`https://antigravity-backend-8lv8.onrender.com/api/packets/:crewId` plus `/api/ai/stream?deviceId=…&crewId=…` (HTTPS, so no ATS exception or
Local Network permission). The Apple Watch SE 3 simulates one astronaut's vitals, sends them to its paired iPhone over
WatchConnectivity, and that iPhone forwards them with `POST /api/samples`; the web and the other iPhone see them via SSE.
The Watch never talks to the backend directly. If the backend is unreachable, the app silently uses its bundled JSON (ADR-0002).
Keep the base URL in one constant so Plan B (`http://<laptop-ip>:8787`) is a one-line change.
