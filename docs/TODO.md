# ANTIGRAVITY — Team TODO List

> NASA Space Apps Challenge 2026: *Create Health Monitoring Software for Astronauts on Space Missions*
> Keep this checklist updated as PRs merge into `main`.

## Phase 1: Shared Data Contract & Threshold Engine (`shared/`, `mobile/ios/Shared/`, `web/src/domain/`)

- [x] Define canonical astronaut JSON packet (`astronautId`, `fullName`, `role`, `mission`, `activeHazardIds`, `measurements`, `watchTelemetry`) in `shared/mock/astronaut-packets.json`
- [x] Add NASA HRP 5 Hazards reference dataset (`https://www.nasa.gov/hrp/hazards/`) in `shared/mock/nasa-hazards.json` and link to Swift & TypeScript models
- [x] Align `crew-1` latest measurements with 7-day history in `shared/mock/samples.json`
- [x] Integrate Apple Watch telemetry models (`WatchTelemetryData`, `ActivitySummary`, `VitalsData`, `EnvironmentalData`, `GForceData`) with `toHealthSamples()` mapper in `mobile/ios/Shared/HealthModels.swift`
- [x] Implement single-source green/amber/red thresholds & 4-part guidance (What / Why / Do now / Escalate) in `mobile/ios/Shared/Thresholds.swift` and `web/src/domain/thresholds.ts`
- [ ] Add multi-day trend escalation rule (3 consecutive readings drifting toward limit -> amber; 2 consecutive days at mood 3 -> red)

## Phase 2: Web Dashboard (`web/`) — Main Demo Surface

- [ ] Scaffold Vite + React + TypeScript + `recharts` in `web/` (preserving `web/src/domain/`)
- [ ] Build `useHealthData()` hook loading `shared/mock/astronaut-packets.json` & `samples.json` with `localStorage` persistence
- [ ] Build Crew Selector (`crew-1`, `crew-2`, `crew-3`) displaying astronaut ID, full name, role, and overall status banner
- [ ] Build `StatusCard` grid for all 9 health indicators + Apple Watch activity & environmental telemetry card (color + icon + label, `data-testid` on every card)
- [ ] Build `TrendChart` (7-day time-series via `recharts`) and `GuidancePanel` (What / Why / Do now / Escalate)
- [ ] Build `EntryForm` for manual measurements & simulated Watch telemetry import (JSON upload / paste)
- [ ] Build clickable SVG `BodyMap` (heart, lungs, brain, bones/metabolism) colored by indicator status
- [ ] Add mission environment switcher (`spacecraft`, `iss`, `lunarBase`, `marsTransit`) and footer disclaimer (`"Demo software, not a medical device."`)

## Phase 3: Apple Watch App (`watch/`)

- [ ] Create `Antigravity.xcodeproj` in `mobile/ios/` with iOS App + Watch App targets sharing `mobile/ios/Shared/`
- [ ] Implement `WatchConnectivity` (`ConnectivityManager.swift`) on Watch and iPhone using `WatchTelemetryData` & `HealthSample`
- [ ] Implement `HeartRateProvider` protocol (`HealthKit` live `HKWorkoutSession` + `MockHeartRateProvider` for Simulator)
- [ ] Build Watch Status Glance screen (overall color, current HR, SpO2, last sync time)
- [ ] Build Watch 5-second Mood (1–5) & Symptom Check-in screen sending `HealthSample` / `WatchTelemetryData` to iPhone

## Phase 4: iPhone Companion App (`mobile/ios/`)

- [ ] Build iPhone Crew & Vitals Dashboard receiving Watch samples via `WCSession`
- [ ] Build Manual Entry sheet (blood pressure, glucose, body temp, sleep hours)
- [ ] Build Indicator Detail view with guidance (What / Why / Do now / Escalate)
- [ ] Add JSON export button (`AstronautHealthPacket` / `WatchTelemetryData`) so iPhone data can be imported directly into the Web Dashboard

## Phase 5: Verification & Submission (`web/e2e/`, `docs/`)

- [ ] Write Playwright E2E smoke test in `web/e2e/` (dashboard load, click red SpO2 card -> guidance visible, submit manual entry -> status updates)
- [ ] Verify paired iPhone 16 Pro + Apple Watch simulator sync end-to-end
- [ ] Write `docs/demo-script.md` and capture screenshots in `docs/screenshots/`
- [ ] Record 3-minute demo video and complete NASA Space Apps submission checklist
