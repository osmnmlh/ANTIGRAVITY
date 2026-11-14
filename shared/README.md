# shared/ — Data contract

The one health-sample shape every client (web, iPhone, watch) uses is defined in `AGENTS.md` → "Data contract".

## Mock data

- `mock/samples.json` contains 243 time-series `HealthSample` records: a seven-day daily and intraday history for all three crew members (81 samples each).
- `mock/astronaut-packets.json` contains each astronaut's profile and latest measurement snapshot. Its latest readings match the final samples in `samples.json`; the web dashboard uses the packet values alongside the retained history.
- `mock/historical-incidents.json` contains the Apollo 13, Mir 1997 fire, and ISS EVA-23 water-leak demo scenarios, each with six telemetry phases.

The packet snapshot is not a weekly history. Use `samples.json` for trends. These are simulated demo values, including scripted amber/red readings, not clinical data.

Changes here affect all clients and must be mentioned in the PR and communicated to the team.
