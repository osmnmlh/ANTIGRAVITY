---
name: web-dashboard
description: Build the web dashboard in web/ with Vite, React and TypeScript - status cards, time-series charts, clickable body map, manual entry forms, mock data. Use for any UI or frontend work in web/.
---

# Web Dashboard (web/)

The web app is the **main demo surface**. Optimize for a judge seeing it for 2 minutes.

## Stack (do not add more without team agreement)

- Vite + React + TypeScript (`npm create vite@latest web -- --template react-ts`)
- Charts: `recharts`. Styling: plain CSS modules or Tailwind (pick one on day 1, don't mix).
- State: React state + a small `useHealthData()` hook. No Redux, no backend required.
- Data: `shared/mock/*.json` loaded at start; manual entries kept in `localStorage`.
- Optional live data: if `VITE_API_URL` is set, fetch `GET /api/packets` + `GET /api/samples` and subscribe to `GET /api/stream` (SSE `packet` events). On any error or timeout (~2 s) **fall back to `shared/mock/*.json`** silently and show a small "offline / mock data" badge. The demo must never depend on `backend/`.
- AI recommendation: call `POST /api/ai/guidance {crewId}` (never call Gemini from the browser, never put an API key in `web/`). Show `aiGuidance` with its disclaimer next to, not instead of, the rule-based guidance.

## Suggested structure

```text
web/src/
  domain/thresholds.ts   # copy of astronaut-health-domain table + getStatus(type, value)
  domain/types.ts        # HealthSample type = shared data contract
  data/useHealthData.ts  # load mock + localStorage, add sample
  components/StatusCard.tsx  BodyMap.tsx  TrendChart.tsx  EntryForm.tsx  GuidancePanel.tsx
  pages/Dashboard.tsx
```

## Screens (priority order, stop when time runs out)

1. **Dashboard**: overall status banner + one card per indicator (value, unit, status color + label, last updated).
2. **Detail / Guidance**: click a card → trend chart (7 days) + What/Why/Do now/Escalate text.
3. **Manual entry**: form per indicator with unit and valid range; instantly updates status.
4. **Body map**: SVG human figure; regions (heart, lungs, bones, brain) colored by related indicators; click → guidance.
5. Nice to have: mission context switch (ISS / Lunar / Mars transit) changing radiation rate; reminders; streak badges.

## Rules

- Every interactive element gets a stable `data-testid` (`status-card-heartRate`, `entry-submit`) for Playwright.
- Status = color + text + icon. Large, high-contrast numbers; dark "mission control" theme is fine.
- Keep `getStatus` pure and unit-test-able; UI never re-implements thresholds.
- Show the disclaimer in the footer.
- Before saying done: `npm run build` passes and you clicked through the flow in the browser.
