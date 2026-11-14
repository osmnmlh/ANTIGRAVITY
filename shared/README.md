# shared/ — Data contract

The shared data files every client (`web/`, `mobile/ios/` iPhone + Watch) uses.

## Files

- `mock/samples.json`: Time-series `HealthSample[]` array matching the `AGENTS.md` contract (`id`, `crewId`, `type`, `value`, `unit`, `timestamp`, `source`). Contains 7-day daily + intraday baseline readings for all 3 crew members (`crew-1`, `crew-2`, `crew-3` — 243 samples total).
- `mock/astronaut-packets.json`: Crew-level JSON packets (`astronautId`, `fullName`, `role`, `mission`, `activeHazardIds`, `measurements`, and Apple Watch `watchTelemetry`) designed to feed Web, iPhone, and watchOS seamlessly.
- `mock/astronaut-packets.json` → `aiGuidance`: AI recommendation (`summary`, `actions[]`, `escalate`, `source`, `overallStatus`). Written only by `backend/` (`POST /api/ai/guidance`); mock values use `source: "fallback"`. The iPhone shows it as "AI recommendation".
- `mock/nasa-hazards.json`: Structured reference dataset of NASA HRP's 5 Hazards of Human Spaceflight (`https://www.nasa.gov/hrp/hazards/`), including health effects, mitigations, reference metrics, and mapped indicators/Watch telemetry fields.
- `mock/historical-incidents.json`: 3 calibrated real historical spaceflight accident simulations (`apollo-13`, `mir-1997-fire`, `iss-eva-23-water`), each with 6 telemetry phases aligned with `web/src/domain/thresholds.ts`.

- `contracts/ai.md` + `contracts/examples/`: shapes for AI alerts, cabin snapshot, devices and chat (ADR-0007).
- `tests/check-trends.mjs` + `tests/trend-cases.json`: checks the multi-day trend rule and that every mock crew starts green. Run `node shared/tests/check-trends.mjs`.

## Bridging Watch Telemetry to Health Samples

`watchTelemetry` mirrors the Swift `WatchTelemetryData` model (`ActivitySummary`, `VitalsData`, `EnvironmentalData`, `GForceData`). Clients map `vitals` fields (`currentHeartRate` -> `heartRate`, `bloodOxygenPercentage` -> `spo2`, `bodyTemperature` -> `bodyTemp`) into `HealthSample` records so watchOS, iOS, and the web dashboard share one threshold and guidance engine.

> Changes in `shared/` must be mentioned in PRs and communicated to the whole team.
