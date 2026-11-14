# 0001. One types/thresholds file per platform

- Status: Proposed
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
`web/src/domain/` (mirrored in `mobile/ios/Shared/Thresholds.swift`); UI wording stays with the web team.
Threshold numbers change only via a PR that edits both TS and Swift.

## Decision
_To be filled by the team._
