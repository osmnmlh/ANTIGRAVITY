# 0002. Web data source: mock first, backend optional

- Status: Accepted
- Date: 2026-11-14
- Affects: web (Ahmetzkn, Omerozcan71), backend (osmnmlh)

## Context
The dashboard (PR #4) reads `shared/mock/samples.json` + localStorage. The relay (PR #3, `backend/server.mjs`)
can serve packets, accept samples and push changes over SSE. A demo that depends on a server or Wi-Fi can die on stage.

## Options
1. **Mock only.** + zero risk. − no live Watch → iPhone → web moment, AI guidance cannot be generated.
2. **Backend required.** + one source of truth, live updates. − demo breaks if the server is down.
3. **Mock first, backend when reachable.** If `VITE_API_URL` is set and `/api/health` answers, use the API + SSE;
   otherwise silently use the mock JSON. Show a small "live / offline demo data" badge.

## Recommendation
Option 3. One small data hook owns the switch, so components never know where data comes from.
No new libraries (plain `fetch` + `EventSource`).

## Decision
Accepted (2026-11-14, osmnmlh): option 3, but the switch is **silent**: no "live / offline" badge and no "AI / fallback" label in the UI.
If the backend or Gemini is down, clients quietly use the mock JSON / deterministic text. The demo disclaimer stays visible.
The backend still sets `aiGuidance.source` (`gemini` | `fallback`) for logs and debugging.
