---
name: web-dashboard
description: Build the web dashboard in web/ with Vite, React and TypeScript - status cards, time-series charts, clickable body map, manual entry forms, mock data. Use for any UI or frontend work in web/.
---

# Web Dashboard (web/)

The web app is the **main demo surface**. Optimize for a judge seeing it for 2 minutes.

## Stack (do not add more without team agreement)

- Vite + React + TypeScript, `three` for the 3D body map. Plain CSS (`App.css`, `index.css`, `src/ai/ai.css`). No chart library, no Tailwind.
- State: React state + the `useHealthData()` hook. No Redux, no backend required.
- Data: `shared/mock/*.json` loaded at start; manual entries kept in `localStorage`.
- UI text is **Turkish** (ADR-0005); indicator labels/guidance come from `src/domain/types.ts` (`metricDefinitions`) and `src/domain/guidance.ts`.
- Live data (#9): if `VITE_API_URL` is set (Vercel: `https://antigravity-backend-8lv8.onrender.com`), fetch `GET /api/packets` + `GET /api/samples` and subscribe to `GET /api/stream` (SSE `hello`, `sample`, `packet`, `simulation`). On any error or timeout (~2 s) **fall back to `shared/mock/*.json` silently, with no badge** (ADR-0002). The demo must never depend on `backend/`.
- Simulations (live + historical incidents) run in the backend (`/api/simulation/*`); the web only triggers them and renders the SSE events. Do not build a second engine in the browser.
- AI: `src/ai/` (`AlertCenter`, `AiChat`, `AiDemoControls`) talks to `/api/ai/*`; mount them in `App.tsx` (#13). Never call Gemini from the browser, never put an API key in `web/`. Show `aiGuidance` next to, not instead of, the rule-based guidance, without a "Gemini / fallback" label (ADR-0002).

## Suggested structure

Current layout on `main` (add new components under `components/` instead of growing `App.tsx`):

```text
web/src/
  App.tsx                    # dashboard: status cards, 7-day trend, scenarios, manual entry, guidance
  components/ThreeBodyMap.tsx  # 3D astronaut body map (three.js)
  data/useHealthData.ts      # mock + localStorage (live backend switch goes here, #9)
  domain/thresholds.ts       # the only getStatus + trend rule (backend imports it too)
  domain/types.ts            # shared data contract + metricDefinitions (Turkish labels)
  domain/guidance.ts         # Turkish What / Why / Do now / Escalate texts
  ai/                        # AI alerts, chat, demo controls (owner: GoktugFerdi)
```

## Screens (priority order, stop when time runs out)

1. **Dashboard**: overall status banner + one card per indicator (value, unit, status color + label, last updated).
2. **Detail / Guidance**: click a card → trend chart (7 days) + What/Why/Do now/Escalate text.
3. **Manual entry**: form per indicator with unit and valid range; instantly updates status.
4. **Body map**: 3D astronaut (`ThreeBodyMap`); regions colored by related indicators; click → guidance.
5. Nice to have: mission context switch (ISS / Lunar / Mars transit) changing radiation rate; reminders; streak badges.

## Rules

- Every interactive element gets a stable `data-testid` (`status-card-heartRate`, `entry-submit`) for Playwright.
- Status = color + text + icon. Large, high-contrast numbers; dark "mission control" theme is fine.
- Keep `getStatus` pure and unit-test-able; UI never re-implements thresholds.
- Show the disclaimer in the footer.
- Before saying done: `npm run build` passes and you clicked through the flow in the browser.
