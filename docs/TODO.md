# ANTIGRAVITY — Team TODO List

> NASA Space Apps Challenge 2026: *Create Health Monitoring Software for Astronauts on Space Missions*
> Keep this checklist updated as PRs merge into `main`. Each open line points to the GitHub issue that owns it.

## Phase 1: Shared Data Contract & Threshold Engine (`shared/`, `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/Models/`, `web/src/domain/`)

- [x] Define canonical astronaut JSON packet (`astronautId`, `fullName`, `role`, `mission`, `activeHazardIds`, `measurements`, `watchTelemetry`) in `shared/mock/astronaut-packets.json`
- [x] Add NASA HRP 5 Hazards reference dataset (`https://www.nasa.gov/hrp/hazards/`) in `shared/mock/nasa-hazards.json` and link to Swift & TypeScript models
- [x] Align `crew-1` latest measurements with 7-day history in `shared/mock/samples.json`
- [x] Integrate Apple Watch telemetry models (`WatchTelemetryData`, `ActivitySummary`, `VitalsData`, `EnvironmentalData`, `GForceData`) with `toHealthSamples()` mapper in `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/Models/HealthModels.swift`
- [x] Implement single-source green/amber/red thresholds & 4-part guidance (What / Why / Do now / Escalate) in `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/Models/Thresholds.swift` and `web/src/domain/thresholds.ts`
- [x] Add multi-day trend escalation rule (3 consecutive readings drifting toward limit -> amber; 2 consecutive days at mood <= 3 -> red; radiation rate spike -> amber)

## Phase 2: Web Dashboard (`web/`) — Main Demo Surface

- [x] Vite + React + TypeScript + `three` dashboard in `web/` (#4); the 3D body map replaced the planned SVG map, no chart library
- [x] `useHealthData()` hook: `shared/mock/samples.json` + `localStorage` persistence
- [x] Status cards for the 9 indicators, 7-day trend view, What / Why / Do now / Escalate guidance (Turkish, ADR-0005)
- [x] 3D body map (`ThreeBodyMap`) colored by indicator status, camera focuses on the selected indicator
- [x] Manual entry, solar-event and sleep-deprivation scenarios, reset, mission environment switch (ISS / Moon / Mars transit), disclaimer
- [x] AI components in `web/src/ai/` (`AlertCenter`, `AiChat`, `AiDemoControls`) built (#31)
- [ ] Live data from the backend via `VITE_API_URL` with silent mock fallback (#9)
- [ ] Crew selector, Watch telemetry and AI recommendation cards (#10)
- [ ] Mount `AlertCenter` and `AiChat` in `App.tsx`, hide live/offline and Gemini/fallback labels (#13)

## Phase 3: Backend (`backend/`, Render)

- [x] Zero-dependency relay: packets, samples, SSE, `POST /api/ai/guidance` with Gemini + fallback (#3, #7)
- [x] AI module wired in: proactive alerts, cabin, devices, 11 demo scenarios, `POST /api/ai/chat` (#21, #24, #26)
- [x] Deployed on Render: `https://antigravity-backend-8lv8.onrender.com`, model `gemini-flash-lite-latest`, loose rate limits (#29, #32)
- [x] Live and historical-incident simulations over SSE (#30)
- [ ] Gemini interprets alerts + phone fan-out + ntfy channel (open PR #33)

## Phase 4: iPhone + Apple Watch (`mobile/ios/`, one Xcode project)

- [x] Xcode project `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat.xcodeproj`; Swift contract + threshold engine in `Shared/Models/`
- [x] iPhone views: Dashboard with 2D body map, Vitals, Missions, Logbook, glass nav bar (#27)
- [ ] Confirm `main` builds in Xcode on the iPhone 16 Pro simulator (#16)
- [ ] Backend base URL constant, packets, AI recommendation card, `/api/ai/stream` alerts, bundled-JSON fallback (#16)
- [ ] Add the watchOS target in Xcode; WatchConnectivity on both sides (#17)
- [ ] Watch status glance + 5-second mood check-in sent to the iPhone, forwarded with `POST /api/samples` (#17)

## Phase 5: Verification & Submission (`web/e2e/`, `docs/`)

- [x] `docs/demo-script.md` and `docs/submission-checklist.md` (#15, #23, #25)
- [ ] Align the simulation spec and demo story with `main` (#34)
- [ ] Demo rehearsal checklist and fresh-clone check (#35)
- [ ] Playwright smoke test in `web/e2e/` + screenshots in `docs/screenshots/` (#11)
- [ ] Record the demo video and complete the NASA Space Apps submission
