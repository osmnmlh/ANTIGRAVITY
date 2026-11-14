# 0006. Demo hosting and submission link

- Status: Accepted
- Date: 2026-11-14
- Affects: web, backend (osmnmlh), submission (Mehmetson01)

## Context
The submission needs a demo video and usually a project link judges can open. The relay holds the Gemini key and must
not be exposed carelessly. Hosting a backend costs setup time.

## Options
1. **Local only + video.** + zero setup. − judges cannot click anything.
2. **Static web on GitHub Pages / Vercel, mock mode only** (ADR-0002 fallback), backend runs on the demo Mac for the live demo. + clickable link, no secret online. − hosted version has no live AI chat (canned fallback only).
3. **Static web + hosted backend (Render/Fly/etc.) with the key.** + everything online. − secret management, cold starts, rate limits, more to break.

## Recommendation
Option 2. Decide at hour ~14 whether there is time for option 3; never put the key in the frontend.

## Decision
Accepted (2026-11-14, osmnmlh): **option 3.** The web (Ahmetzkn, Omerozcan71) is on Vercel; the relay runs on **Render**
(free web service, `render.yaml` at the repo root) at one HTTPS URL: `https://antigravity-backend-8lv8.onrender.com`. The web (`VITE_API_URL`), both iPhones and any
laptop browser (Windows or Mac) use that same URL, so every client shares one in-RAM state and SSE stream.
The Gemini key lives only in Render's environment settings. Free Render sleeps after 15 min idle: open `/api/health`
a few minutes before the demo. Plan B: `cd backend && npm start` on one laptop on a phone hotspot (see `backend/README.md`).
