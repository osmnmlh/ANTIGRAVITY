# Project sources

Every source the ANTIGRAVITY repository uses or cites, collected from the code, docs, ADRs, README, `shared/` data,
`backend/`, `web/`, the iOS/watchOS project and the pitch notes. Each entry: name, URL, and where/how we used it.

> **About our thresholds.** The green/amber/red limits in `shared/`, `web/src/domain/thresholds.ts` and
> `Shared/Models/Thresholds.swift` are **generic adult medical reference ranges chosen for the demo**. They are **not**
> NASA limits and not clinical criteria. The 200 mSv mission radiation budget is a **demo value**. What comes from NASA is
> the **five-hazard framing** of the Human Research Program and the radiation reference points quoted in our copy.
> This is demo software, not a medical device.

## Top 10 for the site form

| # | Source | URL | How we used it |
| --- | --- | --- | --- |
| 1 | NASA Space Apps 2026 — Create Health Monitoring Software for Astronauts on Space Missions | https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/ | The challenge brief we built against (`docs/Hackathon-Subject.md`). |
| 2 | NASA HRP — 5 Hazards of Human Spaceflight | https://www.nasa.gov/hrp/hazards/ | Framing for the whole app: each indicator is mapped to a hazard (`shared/mock/nasa-hazards.json`, hazard cards on the dashboard). |
| 3 | NASA HRP — Risks of Human Spaceflight | https://www.nasa.gov/hrp/risks/ | Background on the health risks behind the indicators we watch (challenge resource, README). |
| 4 | Google Gemini API | https://ai.google.dev/gemini-api/docs | Server-side plain-language guidance and crew chat (`backend/ai/`). The AI never decides the status color. |
| 5 | React | https://react.dev/ | UI library of the web mission-control dashboard (`web/`). |
| 6 | three.js | https://threejs.org/ | 3D astronaut body map and Milky Way background (`GLTFLoader`, WebGL). |
| 7 | Apple WatchConnectivity | https://developer.apple.com/documentation/watchconnectivity | iPhone ↔ Apple Watch sync of samples, status and critical alerts (`mobile/ios/`). |
| 8 | NASA — Apollo 13 | https://www.nasa.gov/mission/apollo-13/ | Historical incident replayed as a scenario (`shared/mock/historical-incidents.json`). |
| 9 | "astronaut" 3D model by Antropik on Sketchfab (CC BY 4.0) | https://sketchfab.com/3d-models/astronaut-482bf87662fd4b378bcb3a2931d59ca3 | Clickable astronaut on the body map; attribution required by the license. |
| 10 | CSA — Monitoring Radiation for Astronaut Health | https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp | Challenge partner resource behind our cumulative radiation dose indicator. |

## Full list

### Challenge and space-agency material

| Source | URL | Where / how used |
| --- | --- | --- |
| NASA Space Apps 2026 challenge page | https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/ | Challenge brief, `docs/Hackathon-Subject.md`. |
| NASA Space Apps Challenge (home) | https://www.spaceappschallenge.org/ | Event, submission (`docs/submission-checklist.md`, README). |
| Challenge video (YouTube) | https://www.youtube.com/watch?v=RERG3gEmdC8 | Linked from the brief and README. |
| NASA HRP — 5 Hazards of Human Spaceflight | https://www.nasa.gov/hrp/hazards/ | `nasa-hazards.json` `sourceUrl`, `historical-incidents.json`, `astronaut-health-domain` skill. |
| NASA HRP — Space Radiation | https://www.nasa.gov/hrp/hazard-space-radiation/ | Hazard card; maps to `radiationDose`. |
| NASA HRP — Isolation and Confinement | https://www.nasa.gov/hrp/hazard-isolation-and-confinement/ | Hazard card; maps to `mood`, `sleepHours`. |
| NASA HRP — Distance from Earth | https://www.nasa.gov/hrp/hazard-distance-from-earth/ | Hazard card; why the astronaut must self-assess and when to call the flight surgeon. |
| NASA HRP — Gravity Fields | https://www.nasa.gov/hrp/hazard-gravity-fields/ | Hazard card; maps to blood pressure and heart rate. |
| NASA HRP — Hostile and Closed Environments | https://www.nasa.gov/hrp/hazard-hostile-closed-environments/ | Hazard card; maps to SpO2, body temperature (cabin incidents). |
| NASA HRP — Risks of Human Spaceflight | https://www.nasa.gov/hrp/risks/ | Challenge resource, README. |
| NASA HRP — Ongoing HRP Research in Space | https://www.nasa.gov/hrp/ongoing-hrp-research/ | Challenge resource, README. |
| NASA hazard videos (YouTube) | https://www.youtube.com/watch?v=3jRxgvwhGC0 · https://www.youtube.com/watch?v=FPinASEKA_I · https://www.youtube.com/watch?v=0_pbs8dG1oM · https://www.youtube.com/watch?v=f3-96ZbY5NA · https://www.youtube.com/watch?v=LgGt03MjHfA | `videoUrl` of each hazard in `nasa-hazards.json`. |
| CSA — Monitoring Radiation for Astronaut Health | https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp | Challenge partner resource, README. |
| CSA — Why Do We Conduct Science Experiments in Space? | https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp | Challenge partner resource, README. |
| NASA / Curiosity RAD — radiation on a Mars trip | https://mars.nasa.gov/resources/5771/radiation-exposure-comparisons-with-mars-trip-calculation/ | Reference point "Mars transit ≈ 1.8 mSv/day" in radiation copy (`astronaut-health-domain`). |
| NASA-STD-3001 radiation protection technical brief | https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-020-radiation-protection.pdf | Reference point "NASA career limit 600 mSv" in radiation copy. Not used as our alert threshold. |

### Historical incidents (scenario replays)

| Source | URL | Where / how used |
| --- | --- | --- |
| NASA — Apollo 13 | https://www.nasa.gov/mission/apollo-13/ | `apollo-13` replay: O2 tank explosion, CO2 build-up, cold cabin. |
| NASA — Apollo 13: The Successful Failure | https://www.nasa.gov/missions/apollo/apollo-13-the-successful-failure/ | LiOH "mailbox" adapter phase of the replay. |
| NASA History — 25 Years Ago: Fire Aboard Space Station Mir | https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/ | `mir-1997-fire` replay: oxygen generator fire and smoke. |
| NASA — 10 Years Ago: EVA 23 | https://www.nasa.gov/general/10-years-ago-eva-23-how-a-high-visibility-close-call-cut-short-a-spacewalk/ | `iss-eva-23-water` replay: water in Luca Parmitano's helmet. |

> The vital-sign values inside each replay phase are **illustrative**, written by the team to show how the app reacts.
> They are not measured crew data.

### Web dashboard (`web/`)

| Source | URL | Where / how used |
| --- | --- | --- |
| React | https://react.dev/ | UI library. |
| Vite | https://vite.dev/ | Dev server and build (`web/vite.config.ts`). |
| TypeScript | https://www.typescriptlang.org/ | Language for the web and the shared domain layer. |
| three.js | https://threejs.org/ | 3D astronaut body map and galaxy background. |
| oxlint | https://oxc.rs/ | Linting (`npm run lint`). |
| Google Fonts — Hanken Grotesk, IBM Plex Mono, Plus Jakarta Sans | https://fonts.google.com/ | Typography (`web/index.html`). |
| MDN — Server-sent events / EventSource | https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events | Live updates from the relay. |
| MDN — Web Speech API (speechSynthesis) | https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API | Spoken alerts fallback. |
| MDN — Notifications API | https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API | Browser alert notifications. |
| MDN — Vibration API | https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API | Haptic alert on phones (`phone.html`). |
| "astronaut" by Antropik, Sketchfab, CC BY 4.0 | https://sketchfab.com/3d-models/astronaut-482bf87662fd4b378bcb3a2931d59ca3 | Body map model (flag decals changed). Credited in `web/README.md`. |
| "Our Milky Way galaxy" by aditya299792, Sketchfab, CC BY 4.0 | https://sketchfab.com/3d-models/our-milky-way-galaxy-f4d5ff16b66c4ed38bc07402030cbc30 | Animated background. Credited in `web/README.md`. |
| Creative Commons Attribution 4.0 | https://creativecommons.org/licenses/by/4.0/ | License of both 3D models. |

### Backend relay and AI (`backend/`)

| Source | URL | Where / how used |
| --- | --- | --- |
| Node.js | https://nodejs.org/ | Zero-dependency relay (`backend/server.mjs`, Node 22.6+ with type stripping, `node --test`). |
| Google Gemini API (`generateContent`) | https://ai.google.dev/gemini-api/docs | `aiGuidance` summaries/actions and crew chat; models `gemini-flash-lite-latest` / `gemini-2.5-flash`; key stays server-side. |
| ElevenLabs Text-to-Speech API | https://elevenlabs.io/docs | Pre-rendered voice clips for spoken alerts (`backend/ai/make-voice-clips.mjs` → `web/public/ai-voice/`). |
| ntfy | https://ntfy.sh/ | Optional push to locked phones (`backend/ai/ntfy.mjs`, ADR-0007). |

### Hosting (ADR-0006)

| Source | URL | Where / how used |
| --- | --- | --- |
| Render | https://render.com/ | Hosts the relay at `https://antigravity-backend-8lv8.onrender.com` (`render.yaml`). |
| Vercel | https://vercel.com/ | Hosts the web dashboard at `https://antigravity-teal-eight.vercel.app/`. |
| GitHub | https://github.com/osmnmlh/ANTIGRAVITY | Source code, issues and PRs. |

### iPhone and Apple Watch (`mobile/ios/`)

| Source | URL | Where / how used |
| --- | --- | --- |
| SwiftUI | https://developer.apple.com/documentation/swiftui | UI of the iPhone and watchOS apps. |
| WatchConnectivity | https://developer.apple.com/documentation/watchconnectivity | iPhone ↔ Watch sync (`WCSession`). |
| WatchKit | https://developer.apple.com/documentation/watchkit | Watch haptics and app lifecycle. |
| UserNotifications | https://developer.apple.com/documentation/usernotifications | Critical-state local notifications on iPhone and Watch. |
| Combine | https://developer.apple.com/documentation/combine | View-model state updates. |
| Xcode | https://developer.apple.com/xcode/ | Build and run both targets. |

### AI coding assistants used during the build

| Source | URL | Where / how used |
| --- | --- | --- |
| Claude Code | https://claude.com/claude-code | Coding assistant (`CLAUDE.md` → `AGENTS.md`). |
| Google Antigravity (Gemini) | https://developers.googleblog.com/en/build-with-google-antigravity-our-new-agentic-development-platform/ | Coding assistant (`GEMINI.md`, `.agent/skills/`). |
| GitHub Copilot | https://github.com/features/copilot | Coding assistant (`.github/copilot-instructions.md`). |
