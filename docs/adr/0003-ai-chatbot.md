# 0003. AI chatbot: where it lives and its guardrails

- Status: Accepted
- Date: 2026-11-14
- Affects: AI/chat (GoktugFerdi), web (Ahmetzkn, Omerozcan71), backend (osmnmlh)

## Context
Already decided by the team lead: Gemini is called **only from the backend**, never from the browser or the iPhone,
and AI answers reach the iPhone inside the packet's `aiGuidance` field. Still open: how the web chat talks to the
backend, how much context it gets, and where the UI sits so it does not collide with the dashboard work.

## Options
**Endpoint**
1. **`POST /api/ai/chat` in `backend/server.mjs`** next to `/api/ai/guidance`, same key, same fallback pattern. + one server. − shared file, coordinate edits.
2. **Separate chat server.** + no shared file. − second process, second port, second thing to start on stage.

**Context sent to Gemini**
- a) Only the selected astronaut's packet (latest readings + computed status + active hazards) + last few chat turns, kept in the browser.
- b) Full history from `samples.json`. More tokens, slower, little demo value.

**UI placement**
- i) Self-contained component (`web/src/components/AiChat/`) the web team mounts once (side drawer or panel).
- ii) Chat woven into existing cards. More merge conflicts with the dashboard branch.

## Recommendation
1 + a + i. Rules for any AI text: it never sets green/amber/red (threshold engine does), always ends with
"contact the flight surgeon if …", is labeled "AI recommendation — demo, not medical advice", and works without
a key (canned fallback answer built from the rule-based guidance). Branch from `main` after PR #4 merges
(or from `feat/web-body-hologram` until then) and agree with the web devs on the mount point.

## Decision
Accepted (2026-11-14, osmnmlh): **1 + a + i**, as built. `POST /api/ai/chat` lives in `backend/ai/chat.mjs` and is served by
`backend/server.mjs` (#24, #26) on the Render URL; context = the selected astronaut's computed statuses + last turns;
the web panel is a self-contained component (#13). Fallback is silent (ADR-0002): no "AI offline" banner.
