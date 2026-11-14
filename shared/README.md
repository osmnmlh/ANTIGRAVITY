# shared/ — Data contract

The shared data files every client (`web/`, `mobile/ios/` iPhone + Watch) uses.

## Files

- `mock/samples.json`: Time-series `HealthSample[]` array matching the `AGENTS.md` contract (`id`, `crewId`, `type`, `value`, `unit`, `timestamp`, `source`).
- `mock/astronaut-packets.json`: Crew-level JSON packets (`astronautId`, `fullName`, `role`, `mission`, `activeHazardIds`, `measurements`, and Apple Watch `watchTelemetry`) designed to feed Web, iPhone, and watchOS seamlessly.
- `mock/astronaut-packets.json` → `aiGuidance`: AI recommendation (`summary`, `actions[]`, `escalate`, `source`, `overallStatus`). Written only by `backend/` (`POST /api/ai/guidance`); mock values use `source: "fallback"`. The iPhone shows it as "AI recommendation".
- `mock/nasa-hazards.json`: Structured reference dataset of NASA HRP's 5 Hazards of Human Spaceflight (`https://www.nasa.gov/hrp/hazards/`), including health effects, mitigations, reference metrics, and mapped indicators/Watch telemetry fields.

## Bridging Watch Telemetry to Health Samples

`watchTelemetry` mirrors the Swift `WatchTelemetryData` model (`ActivitySummary`, `VitalsData`, `EnvironmentalData`, `GForceData`). Clients map `vitals` fields (`currentHeartRate` -> `heartRate`, `bloodOxygenPercentage` -> `spo2`, `bodyTemperature` -> `bodyTemp`) into `HealthSample` records so watchOS, iOS, and the web dashboard share one threshold and guidance engine.

> Changes in `shared/` must be mentioned in PRs and communicated to the whole team.
