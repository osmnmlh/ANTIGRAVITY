# ANTIGRAVITY web dashboard

The web demo is a responsive, single-screen mission-control view for astronaut health indicators. It follows the hackathon brief and the shared JSON sample contract in `../shared/mock/samples.json`.

## Run locally

```bash
npm install
npm run dev
```

Run the production type-check and build with `npm run build`.

## Demo flow

1. Select the ISS, lunar, or Mars-transit environment. Mars mode highlights the simulated Earth-communication delay and autonomous self-assessment.
2. Review the 3D body map, status summary, and indicator cards. The body map uses a custom contoured human mesh with a translucent cyan hologram, rim light, wireframe, rotating radar floor, and moving scanline.
3. Use a one-click solar-event or sleep-deprivation scenario, or enter a manual measurement.
4. Select an indicator to see its simulated seven-day trend, related NASA HRP hazard, plain-language context, and next-step guidance. The 3D camera smoothly focuses on that body-map region; its HUD label shows the system, value, and unit. Selected and highest-priority warning regions are labeled, with a control to return to the full-body view.

Health samples keep the shared flat shape and manual entries are stored in browser local storage. The dashboard starts with a nominal demo baseline; scenario buttons add scripted anomalies. The UI currently uses local mock data; it does not sync across devices. The 200 mSv radiation budget is a demo value, not a NASA mission limit. All thresholds and sample values are illustrative, not clinical criteria.

**Demo software, not a medical device.**
