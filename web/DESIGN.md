# Web design: "Sıcak Gözlemevi"

Warm anthracite, marble white, brass. Replaces the old navy / cyan / neon-green look. The page structure and every component are unchanged; this is a theme.

## Where things live
| File | What |
| --- | --- |
| `src/theme.css` | **Tokens and fonts**: palette, motion timings, `@font-face`. Change a color here and the whole app follows. |
| `src/cosmos-shell.css` | **Design layer** loaded after `App.css`: surfaces, marble moments, buttons, typography, entrance motion, phone fixes. |
| `public/fonts/` | Self-hosted woff2 (Fraunces, Hanken Grotesk, IBM Plex Mono, incl. `latin-ext` for ğ ş İ). No internet needed on stage. |
| `src/components/ThreeBodyMap.tsx` | 3D astronaut: warm lights, brass scan line and nameplate, zero-gravity float, drifting dust. |
| `src/ai/Icon.tsx` | SVG icon set for the AI components (no emoji as icons). |

## Palette
| Role | Value |
| --- | --- |
| Page / card / raised | `#181716` / `#1f1e1c` / `#2a2825` (never pure black) |
| Marble white (text, light surfaces) | `#f0eadf`; on marble: text `#201e1b`, muted `#5a544a` |
| Brass (the one accent) / copper | `#cfa86a` / `#bd7b52` |
| Status sage / amber / terracotta | `#92b89b` / `#e0aa55` / `#dd6b57` (on marble: `#35644a` / `#85560c` / `#9c3a29`) |

Contrast (WCAG): primary text 13:1, secondary 7:1, muted 4.9:1 on the cards; status text on marble 5.4:1 or better.
Status is never color alone: every status keeps its icon and its label.

## Type
Fraunces (display: page titles, panel titles, big numbers) · Hanken Grotesk (everything you read) · IBM Plex Mono (short uppercase telemetry labels only).
`--heading` and `--mono` are legacy aliases and now point to the grotesk, so sentences never render in mono; opt in to mono by listing the selector in the "Mono is for telemetry labels" block of `cosmos-shell.css`. Smallest text is 11px.

## Marble
The one light material, used where the eye should land: the overall-status band and every primary button. Everything else is anthracite.

## Motion
Opacity and transform only. Entrance: sections rise one after another (`shell-rise`), a critical badge breathes, the 3D scene floats and dust drifts.
`prefers-reduced-motion` switches all of it off (CSS in `theme.css`, `reduceMotion` in `ThreeBodyMap.tsx`).

## How it was checked
Headless Edge screenshots at 1440, 820 and 390 px of the astronaut view, the base view, an alert popup with the AI advice, the voice settings and the test phone, plus `tsc`, `vite build` and `oxlint`.
