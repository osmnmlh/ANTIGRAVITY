# 0004. iPhone / Watch data flow

- Status: Proposed
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
Simulator talks to `http://localhost:8787`; a real device needs the Mac's IP (see `backend/README.md`).

## Decision
_To be filled by the team._
