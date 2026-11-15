# AI test environment

One command starts everything needed to try the AI alerts, the Gemini interpretation, the chat and the multi-phone
notification, on one computer or with real phones in the same network.

```bash
# from the repo root (Node 22.6+)
node --experimental-strip-types backend/ai/test-env.mjs
```

It starts the relay (`backend/server.mjs`, port 8787, with the AI module) and the web dev server (port 5174, reachable from
the network) and prints the links, for example:

```text
Kokpit         http://localhost:5174/ai-preview.html
Emirhan Gokce    http://<wifi-ip>:5174/phone.html?crewId=crew-1
Omer Ozcan  http://<wifi-ip>:5174/phone.html?crewId=crew-2
```

Gemini is on when `backend/.env` contains `GEMINI_API_KEY` (git-ignored; copy `backend/.env.example`). The relay health
line shows `gemini: true` and the model. Without a key everything still works with the rule-based texts.

## Integrated app (the web team's UI with the AI mounted, on `shared/mock/all-data.json`)

`http://localhost:5174/` is the team's dashboard (astronaut selector, **Astronotlar** / **Ana üs**) with the AI inside: the alert bar bottom-right, the chat under the health view,
and in **Ana üs** the cabin chat, connected phones and scenario buttons. Their simulation buttons talk to the same relay, so the **Apollo 13 / Mir / ISS EVA replays raise the AI
alerts** (cabin ones included) and the live simulation stays green. Everything starts green (demo script); `POST /api/demo/reset` returns to that.

## Pages

| Page | What it is |
| --- | --- |
| `/ai-preview.html` | **Cockpit sandbox**: alert dock + popup, scenario buttons, connected phones, chat (cabin or one astronaut). Stands in for the web team's views until `App.tsx` mounts the components |
| `/phone.html?crewId=crew-1` | **Test phone** of one astronaut: registers as a device, gets alerts at the same moment as the other phones, vibrates, speaks, raises a system notification when in the background, acknowledges. One browser tab = one phone |

## Checklist

1. **Connection**: cockpit dock says "AI canlı"; the "Bağlı telefonlar" panel is empty.
2. **Two phones**: open `phone.html?crewId=crew-1` and `?crewId=crew-2` (two tabs, or two real phones). Tap "Bildirimleri başlat" on each. The cockpit panel shows both online.
3. **Simultaneous notification**: click "Gaz sızıntısı" in the cockpit. Both phones show a compact red popup; each plays the alarm tone and says only "Uyarı. Kabinde gaz salınımı." within the same second; the cockpit panel shows "2/2 telefona ulaştı". A third phone for `crew-3` (lunar base) gets nothing. An **amber** alert is only a soft tone, no speech: `curl -X POST localhost:8787/api/ai/cabin -H 'content-type: application/json' -d '{"readings":[{"metric":"ppCO2","value":4}]}'`.
3b. **Voice**: press ⚙ in the alert bar: the Turkish voices of this device are listed (female ones marked), pick one, press a character preset or move speed / tone and press "Dene". The best female voice is used by default.
4. **Acknowledge**: press "Anladım" on one phone. The cockpit panel and the other phone show that ack.
5. **Recommendation on request**: in the popup press "🤖 AI önerisi": the steps, why and when to call the flight surgeon appear in writing (about 1.5 s after the alert Gemini's "✦ AI yorumu" is added). Press "🔊 Sesli oku" to hear the steps; press again to stop. Nothing of this is spoken automatically.
6. **Correlation**: click "Düşük tansiyon" while the gas alert is active: the interpretation mentions both.
7. **Chat**: ask "Astronotun şu anki durumu nasıl?" (source badge says Gemini); ask for a medicine dose or a pizza recipe (safe redirect).
8. **Missed alert**: on a phone tab open DevTools → Network → set "Offline" for 10 s, fire a scenario in the cockpit, set it back to online. The phone announces the missed alert once and the cockpit counts it as delivered.
9. **Offline**: stop the relay: dock says "AI çevrimdışı", nothing crashes. Start it again: it reconnects by itself.
10. **Reset**: "↺ Sıfırla" (or `POST /api/demo/reset`) returns everything to the start.

## Real phones

- Computer and phones on the same Wi-Fi (a phone hotspot works well). Use the Wi-Fi address the script prints, not a VirtualBox / Hyper-V one.
- Windows may ask to allow Node.js through the firewall: allow **private networks**. If a phone cannot connect, allow ports 5174 and 8787.
- Browsers only allow audio after a tap, hence the "Bildirimleri başlat" button. System notifications and the vibration API need
  a secure context or a supported browser (Android Chrome yes; iPhone Safari over plain `http` shows the popup, speaks, but cannot raise system notifications).

## Locked phones (optional): ntfy.sh

Set `NTFY_TOPIC=<long-random-name>` in `backend/.env`, restart, and subscribe the phone of crew-1 to `<name>-crew-1` in the free
ntfy app. Alerts then also arrive on locked screens. Topics are public to anyone who knows the name: demo data only.

## Automated tests

```bash
node --experimental-strip-types --test backend/ai/ai.test.mjs   # rules, routing, Gemini (stubbed), ntfy (stubbed), two simultaneous phones
cd web && npm run build && npx oxlint src/ai
```
