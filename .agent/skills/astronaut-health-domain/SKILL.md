---
name: astronaut-health-domain
description: Astronaut health indicators, demo thresholds, green/amber/red status rules and plain-language guidance text. Use whenever code or UI deals with health values, risk status, alerts, or advice for the astronaut.
---

# Astronaut Health Domain

Goal of the product: an astronaut, far from Earth, can **measure → see status → understand why → know what to do**.

## The 5 hazards (NASA HRP) → what we watch

| Hazard | Effect | Indicators we show |
| --- | --- | --- |
| Space radiation | Immune change, cancer/CNS risk | Cumulative dose (mSv), daily dose |
| Isolation & confinement | Mood, stress, sleep problems | Mood (1-5), sleep hours |
| Distance from Earth | Comms delay, must self-assess | Guidance text, "call flight surgeon" trigger |
| Altered gravity | Bone loss (~1-1.5%/month in weight-bearing bones), fluid shift, cardio deconditioning | Heart rate, blood pressure, exercise minutes |
| Hostile closed environment | CO2, nutrition, infection | Body temp, SpO2, blood glucose |

## Demo thresholds (single source; mirror exactly on web/iOS/watch)

| type | unit | green | amber | red |
| --- | --- | --- | --- | --- |
| heartRate (resting) | bpm | 50-100 | 40-49 or 101-120 | <40 or >120 |
| bloodPressureSys | mmHg | 90-129 | 130-139 | <90 or >=140 |
| bloodPressureDia | mmHg | 60-79 | 80-89 | <60 or >=90 |
| spo2 | % | >=95 | 90-94 | <90 |
| bodyTemp | °C | 36.1-37.5 | 37.6-38.4 or 35.0-36.0 | >=38.5 or <35.0 |
| bloodGlucose (fasting) | mg/dL | 70-125 | 54-69 or 126-180 | <54 or >180 |
| sleepHours (last 24h) | h | >=7 | 5-6.9 | <5 |
| mood | 1-5 | 4-5 | 3 | 1-2 (or 2 days in a row at 3) |
| radiationDose (cumulative) | mSv | <50% of mission budget | 50-80% | >80% |

Reference points for radiation copy: ISS ≈ 0.3-0.8 mSv/day, Mars transit ≈ 1.8 mSv/day (Curiosity RAD), NASA career limit 600 mSv.
These are **demo values from general adult reference ranges**, not clinical criteria. Keep them in one table/const per platform.

## Status rules

- Overall status = worst single indicator.
- A trend can raise status: 3 consecutive readings drifting toward a limit → amber.
- No reading for an expected daily measurement → grey "missing" + reminder, not green.

## Guidance text pattern (every indicator needs all four)

1. **What** it is (one sentence, no jargon).
2. **Why** it matters in space (link to a hazard).
3. **Do now**: 1-3 concrete self-care actions (hydrate, rest, repeat measurement in 15 min, exercise protocol, shielded area during solar event).
4. **Escalate**: when to contact crew medical officer / flight surgeon (always for red).

Example (red SpO2): "Your blood oxygen is below 90%. In a closed cabin this can mean a CO2/air-quality issue or a lung problem. Stop exertion, sit upright, re-measure in 5 minutes. If still below 90%, alert the crew medical officer and contact the flight surgeon now."

## Rules

- Always show the disclaimer: "Demo software, not a medical device."
- Never diagnose; describe the reading and the action.
- Use color **and** an icon/label (color-blind safe).
- Mock data must look realistic: HR 55-85, small daily noise, one or two scripted anomalies for the demo story.
