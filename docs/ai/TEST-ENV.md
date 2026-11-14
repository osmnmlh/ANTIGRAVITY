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
Dr. Elena Vance    http://<wifi-ip>:5174/phone.html?crewId=crew-1
Cmdr. Marcus Chen  http://<wifi-ip>:5174/phone.html?crewId=crew-2
```

Gemini is on when `backend/.env` contains `GEMINI_API_KEY` (git-ignored; copy `backend/.env.example`). The relay health
line shows `gemini: true` and the model. Without a key everything still works with the rule-based texts.

## Pages

| Page | What it is |
| --- | --- |
| `/ai-preview.html` | **Cockpit sandbox**: alert dock + popup, scenario buttons, connected phones, chat (cabin or one astronaut). Stands in for the web team's views until `App.tsx` mounts the components |
| `/phone.html?crewId=crew-1` | **Test phone** of one astronaut: registers as a device, gets alerts at the same moment as the other phones, vibrates, speaks, raises a system notification when in the background, acknowledges. One browser tab = one phone |

## Checklist

1. **Connection**: cockpit dock says "AI canlı"; the "Bağlı telefonlar" panel is empty.
2. **Two phones**: open `phone.html?crewId=crew-1` and `?crewId=crew-2` (two tabs, or two real phones). Tap "Bildirimleri başlat" on each. The cockpit panel shows both online.
3. **Simultaneous notification**: click "Gaz sızıntısı" in the cockpit. Both phones show the red popup and speak within the same second; the cockpit panel shows "2/2 telefona ulaştı". A third phone for `crew-3` (lunar base) gets nothing.
4. **Acknowledge**: press "Anladım" on one phone. The cockpit panel and the other phone show that ack.
5. **Gemini interpretation**: about 1.5 s after the alert, the popup gets an "✦ AI yorumu" block and "Gemini yorumladı"; with voice on, the summary is spoken once. Without a key the block never appears and the rule-based advice stays.
6. **Correlation**: click "Düşük tansiyon" while the gas alert is active: the interpretation mentions both.
7. **Chat**: ask "Astronotun şu anki durumu nasıl?" (source badge says Gemini); ask for a medicine dose or a pizza recipe (safe redirect).
8. **Offline**: stop the relay: dock says "AI çevrimdışı", nothing crashes. Start it again: it reconnects by itself.
9. **Reset**: "↺ Sıfırla" (or `POST /api/demo/reset`) returns everything to the start.

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
