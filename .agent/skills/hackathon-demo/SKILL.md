---
name: hackathon-demo
description: Scope, prioritize and cut features for a 24-hour hackathon, plan the timeline, write the demo script and prepare the NASA Space Apps submission (video, screenshots, README). Use when deciding what to build next, when behind schedule, or when preparing the final demo.
---

# Hackathon Plan & Demo

## Principle

The judges see a **3-minute story**, not the codebase. Build backwards from the demo.

## Demo story (default; edit in docs/demo-script.md)

1. Context (20s): Mars transit, day 120, 20-minute comms delay; astronaut must self-assess.
2. Watch (30s): morning check-in on the wrist: mood 3, heart rate auto-captured → syncs to iPhone.
3. iPhone/Web (60s): dashboard: sleep amber, radiation trend, one red indicator after a solar event.
4. Guidance (40s): click red card / body map → why it matters, what to do now, when to call the flight surgeon.
5. Close (30s): impact + what's next (more sensors, ground sync, ML trends).

## Timeline (~24h)

| Hour | Goal |
| --- | --- |
| 0-1 | Agree scope, owners, data contract, mock data. Repo builds. |
| 1-8 | Core: web dashboard + entry; watch check-in; phone receives samples. |
| 8-14 | Guidance texts, body map, trend charts, phone↔watch sync working. |
| 14-18 | Integrate, Playwright smoke green, fix ugly parts. |
| 18-21 | **Feature freeze.** Record demo video, screenshots, README. |
| 21-24 | Submit early. Buffer for upload/surprises. |

## Cutting rules (when behind)

- Ask: "Is it in the demo story?" No → cut.
- Real sensor fails? Use mock data with a visible "simulated" label; never let the demo depend on live hardware or network.
- Prefer one polished flow over three half flows.
- Timebox any bug to 30 minutes, then ask a teammate or work around it.

## Submission checklist

- [ ] Demo video (≤ the event's length limit), shows watch + phone + web
- [ ] Screenshots in `docs/screenshots/`
- [ ] README: problem, solution, how to run, team, NASA/space agency data & resources used
- [ ] "Demo software, not a medical device" disclaimer
- [ ] AI tools used are disclosed as the event rules require
- [ ] `main` builds from a fresh clone
