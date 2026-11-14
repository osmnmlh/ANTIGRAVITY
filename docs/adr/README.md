# Architecture Decision Records (ADRs)

Short records of decisions that set **boundaries** for everyone's work. They are not specs:
inside the boundary, each owner (and their agent) decides how to build.

- Status flow: `Proposed` → `Accepted` (or `Rejected` / `Superseded by NNNN`).
- To decide: the team picks an option, edit **Decision** + **Status** in a tiny PR (or ask osmnmlh). Keep it one paragraph.
- Agents: read the ADRs linked from your issue before coding. A `Proposed` ADR → follow the **Recommendation** until the team decides.
- New ADR: copy the template below, next number, max ~1 page. Only for choices that affect more than one person.

| # | Title | Status | Affects |
| --- | --- | --- | --- |
| [0001](0001-single-domain-layer.md) | One types/thresholds file per platform | Accepted | web, backend, shared |
| [0002](0002-web-data-source.md) | Web data source: mock first, backend optional | Proposed | web, backend |
| [0003](0003-ai-chatbot.md) | AI chatbot: where it lives and its guardrails | Proposed | web, backend, AI |
| [0004](0004-mobile-data-flow.md) | iPhone / Watch data flow | Proposed | iOS, watchOS, backend |
| [0005](0005-ui-language.md) | UI language (Turkish vs English) | Proposed | all clients |
| [0006](0006-demo-hosting.md) | Demo hosting and submission link | Proposed | web, backend, docs |
| [0007](0007-proactive-ai-alerts.md) | Proactive AI alerts, cabin monitoring, phone fan-out | Proposed | AI, backend, web, iOS |

## Template

```markdown
# NNNN. Title

- Status: Proposed
- Date: YYYY-MM-DD
- Affects: who / which folders

## Context
Why we need to decide (2-4 sentences).

## Options
1. **A** — one line, + / −
2. **B** — one line, + / −

## Recommendation
Option X, because …

## Decision
_To be filled by the team._
```
