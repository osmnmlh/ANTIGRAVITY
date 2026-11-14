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
2. Review the 3D body map, status summary, and indicator cards. The original textured astronaut model is enlarged and can be rotated by dragging with a mouse or touch; a rotating radar floor and moving scanline frame the model.
3. Use a one-click solar-event or sleep-deprivation scenario, or enter a manual measurement.
4. Select an indicator to see its simulated seven-day trend, related NASA HRP hazard, plain-language context, and next-step guidance. The 3D camera smoothly focuses on that body-map region; its HUD label shows the system, value, and unit. Selected and highest-priority warning regions are labeled, with a control to return to the full-body view.

Health samples keep the shared flat shape and manual entries are stored in browser local storage. The dashboard starts with a nominal demo baseline; scenario buttons add scripted anomalies. The UI currently uses local mock data; it does not sync across devices yet. Live data from `VITE_API_URL` (`https://antigravity-backend-8lv8.onrender.com` on Vercel) is tracked in #9, and mounting the AI alert/chat components from `src/ai/` in #13. The 200 mSv radiation budget is a demo value, not a NASA mission limit. All thresholds and sample values are illustrative, not clinical criteria.

**Demo software, not a medical device.**

## 3D model attribution

The astronaut model is **"astronaut" by Antropik**, sourced from [Sketchfab](https://sketchfab.com/3d-models/astronaut-482bf87662fd4b378bcb3a2931d59ca3) and licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). The original textures and materials are retained, with the suit's flag decals changed to Turkish flags.

## 3D Milky Way background attribution

The animated 3D Milky Way background is **"Our Milky Way galaxy" by aditya299792**, sourced from [Sketchfab](https://sketchfab.com/3d-models/our-milky-way-galaxy-f4d5ff16b66c4ed38bc07402030cbc30) and licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
