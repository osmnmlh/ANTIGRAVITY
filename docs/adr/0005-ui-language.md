# 0005. UI language (Turkish vs English)

- Status: Proposed
- Date: 2026-11-14
- Affects: web, iOS, watchOS, AI chat

## Context
The web dashboard (PR #4) is in Turkish; AGENTS.md asks for code and docs in English but says nothing about UI text.
NASA Space Apps judging and the demo video are usually reviewed in English. Mixed languages across web, phone and
chatbot would look unfinished.

## Options
1. **English UI everywhere.** + matches judges and NASA terms. − rework of existing Turkish strings.
2. **Turkish UI everywhere.** + no rework, natural for the team. − judges may not follow; video needs subtitles.
3. **Both, with a toggle.** + flexible. − doubles text work and testing. Overengineering for 24 h.

## Recommendation
Option 1, with all user-facing strings in one file per client (e.g. `web/src/ui/labels.ts`) so a later switch is cheap.
The AI chat answers in the language the user writes in.

## Decision
_To be filled by the team._
