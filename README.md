<div align="center">

# 🚀 ANTIGRAVITY

### 2026 NASA Space Apps Challenge — Astronaut Health Monitoring Software

[![Event](https://img.shields.io/badge/Event-2026_NASA_Space_Apps_Challenge-0B3D91?style=for-the-badge&logo=nasa&logoColor=white)](https://www.spaceappschallenge.org/2026/challenges/)
[![Difficulty](https://img.shields.io/badge/Difficulty-Intermediate-F59E0B?style=for-the-badge)](./docs/Hackathon-Subject.md)
[![Subjects](https://img.shields.io/badge/Focus-Human_Exploration_%E2%80%A2_Software_%E2%80%A2_Space-6366F1?style=for-the-badge)](./docs/Hackathon-Subject.md)

</div>

---

## 🌌 About the Challenge

**ANTIGRAVITY** is our project repository for the **2026 NASA Space Apps Challenge** under the topic:
> **"Create Health Monitoring Software for Astronauts on Space Missions"**

As crewed spaceflight expands beyond low Earth orbit—through NASA’s **Artemis** lunar missions and future journeys toward **Mars**—astronauts face extended exposure to harsh space environments. On long-duration missions, crews bear greater responsibility for tracking, evaluating, and acting upon changes in their own physical and behavioral health.

The goal of this challenge is to design and build an intuitive **visual health monitoring tool** that collects health indicators, translates complex medical metrics into clear assessments, and provides actionable guidance for prevention, treatment, and overall well-being in space.

---

## ☄️ Five Hazards of Human Spaceflight

Per NASA’s Human Research Program (HRP), software solutions should account for the five core hazards of human spaceflight and their downstream effects on astronaut health:

| Hazard | Associated Health Risks |
| :--- | :--- |
| **Space Radiation** | Immune system changes, cellular & long-term radiation damage |
| **Isolation & Confinement** | Behavioral health conditions, sleep disruption, mood shifts |
| **Distance from Earth** | Delayed ground support, need for autonomous self-assessment |
| **Altered Gravity Fields** | Bone density loss, cardiovascular deconditioning, fluid shifts |
| **Hostile Closed Environments** | Inadequate nutrition, environmental & physiological stressors |

### Key Health Indicators

- 💓 **Cardiovascular:** Heart rate, blood pressure
- 🩸 **Metabolic & Physiological:** Blood sugar (`mg/dL`), body temperature
- 😴 **Behavioral & Recovery:** Daily sleep hours, mood tracking
- 🩻 **Diagnostic & Visual Inputs:** Keyboard/numeric entries, interactive selections, or medical imagery (e.g., ultrasound images)

---

## 🎯 Core Objectives & Design Directions

1. **Multi-Modal Health Data Collection** — Support flexible inputs (manual metrics, guided prompts, interactive clicks, or camera/ultrasound imagery) representing meaningful health indicators.
2. **Interactive & Visual UI/UX** — Present metrics and diagnoses clearly using animations, dynamic time-series charts, color-coded status indicators, and interactive visualizations (such as a clickable human body map).
3. **Actionable Guidance & Triage** — Explain *why* a measurement matters, when an anomaly warrants crew or flight-surgeon attention, and what preventive or corrective actions to take.
4. **Mission-Routine Integration** — Adapt insights to mission environments (spacecraft, space station, rover, or planetary/lunar base), schedule periodic check-in prompts, and optionally encourage engagement through gamification.
5. **Accessible Explanations** — Never assume prior medical expertise; provide plain-language instructions for measurements, indicators, and risks.

---

## 📁 Repository Structure

```text
ANTIGRAVITY/
├── docs/
│   ├── Hackathon-Subject.md    # Structured Markdown specification of the challenge brief
│   └── Hackathon-Subject.pdf   # Original challenge brief PDF
└── README.md                   # Project overview and challenge documentation
```

- 📄 **Challenge Specification (Markdown):** [`docs/Hackathon-Subject.md`](./docs/Hackathon-Subject.md)
- 📑 **Original Challenge Brief (PDF):** [`docs/Hackathon-Subject.pdf`](./docs/Hackathon-Subject.pdf)

---

## 🔗 Official Resources

- 🎥 **Challenge Briefing Video:** [YouTube — 2026 NASA Space Apps Challenge](https://www.youtube.com/watch?v=RERG3gEmdC8)
- 🌐 **Challenge Portal:** [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/challenges/)
- 🧬 **NASA HRP — 5 Hazards of Human Spaceflight:** [nasa.gov/hrp/hazards](https://www.nasa.gov/hrp/hazards/)
- ⚠️ **NASA HRP — Risks of Human Spaceflight:** [nasa.gov/hrp/risks](https://www.nasa.gov/hrp/risks/)
- 🔬 **NASA HRP — Ongoing Research in Space:** [nasa.gov/hrp/ongoing-hrp-research](https://www.nasa.gov/hrp/ongoing-hrp-research/)
- 🇨🇦 **CSA — Monitoring Radiation for Astronaut Health:** [asc-csa.gc.ca](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp)
- 🛰️ **CSA — Why Do We Conduct Science Experiments in Space?:** [asc-csa.gc.ca](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp)
