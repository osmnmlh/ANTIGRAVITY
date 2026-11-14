# 0001. One types/thresholds file per platform

- Status: Accepted
- Date: 2026-11-14
- Affects: web (Ahmetzkn, Omerozcan71), backend (osmnmlh, GoktugFerdi), shared (Mehmetson01)

## Context
Two versions of `web/src/domain/types.ts` and `thresholds.ts` exist: PR #2/#3 (packets, Watch telemetry,
`aiGuidance`, 4-part guidance; the backend imports this file) and PR #4 (the dashboard's own copy plus
`guidance.ts` and Turkish labels). Whichever PR merges second will conflict, and two engines can disagree on a color.
AGENTS.md says status logic lives in **one place per platform**.

## Options
1. **Keep PR #2/#3's domain files; PR #4 adapts.** Dashboard imports `getStatus`/types from them; its labels,
   icons and texts move to a UI-only file (e.g. `web/src/ui/labels.ts`). + backend, Swift and web stay in sync. − some rework in #4.
2. **Keep PR #4's files; #2/#3 adapt.** + dashboard untouched. − backend + Swift mirror must be redone, packets/aiGuidance types lost.
3. **Merge both by hand into one file.** + nothing lost. − slowest, easiest to break during a hackathon.

## Recommendation
Option 1. Merge order: #3 → #2 → `main`, then #4 rebases on `main`. Thresholds/types live in
`web/src/domain/` (mirrored in `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/Models/Thresholds.swift`); UI wording stays with the web team.
Threshold numbers change only via a PR that edits both TS and Swift.

## Decision
Accepted (osmnmlh, 2026-11-14), done as a light version of option 3 because PR #4 merged first.
There is **one** `web/src/domain/types.ts` and **one** `web/src/domain/thresholds.ts`: PR #4's exports
(`healthTypes`, `metricDefinitions`, `isHealthSample`, `statusLabels`, `statusDescriptions`, `DEMO_MISSION_DOSE_BUDGET_MSV`)
are kept unchanged, PR #2/#3's packet, Watch, hazard and `aiGuidance` types and `getOverallStatus` / `getGuidance` /
`watchTelemetryToSamples` were added, and there is a single `getStatus`. Default dose budget is 200 mSv on web and Swift.
`guidance.ts` (Turkish dashboard text) and `getGuidance` (English, used by the backend fallback) both stay until ADR-0005 decides the language.
