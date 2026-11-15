# Live demo scenarios on web, iPhone and Watch

> Demo software, not a medical device. Every value a scenario produces is simulated.

The web **Senaryolar** tab starts a showcase scenario with `POST /api/ai/demo/:id` (body `{ "crewId": "crew-2" }` for a
one-astronaut scenario; the web sends the astronaut selected in the UI). Scope is unchanged: cabin scenarios hit everyone
in the cabin, `orthostatic` and the other vital scenarios hit one astronaut.

## What the relay does now (`backend/ai/index.mjs`)

1. **Onset (t = 0):** the scenario's target values are written as real samples at once, so the alert fires immediately
   (same as before), and a `scenario` event announces the start.
2. **Live phase (15 s, `DEMO_SCENARIO_MS`):** every second (`DEMO_TICK_MS`, default 1000) the values move along a curve:
   onset value → slowly worse until the peak (+20 % of the deviation at half time) → slight easing back at the end, with a
   little jitter. A drift never changes the colour the scenario was designed for (an amber value stays amber).
   Each tick goes out as normal `sample` + `packet` events on `/api/stream`, then the rules run again and a `scenario`
   event with the live values is sent.
3. **Cabin scenarios** also move every cabin astronaut's vitals, but only to **amber** (for example the gas leak raises the
   heart rate and lowers SpO2 a little), so each astronaut's own parameters react without adding extra red alerts.
4. **End:** after 15 s (or `POST /api/ai/demo/reset`, `POST /api/demo/reset`) the values are put back, alerts resolve and
   one last `scenario` event with `{ "active": false }` is sent.
5. The relay's live telemetry jitter (`/api/simulation/live/start`) skips the values a scenario drives, so the scenario
   values are no longer overwritten by green jitter every 2 s.

## The `scenario` event

Sent on **both** `/api/stream` and `/api/ai/stream`, and included as `scenario` in both `hello` events.
Also readable with `GET /api/ai/scenario`, and returned as `scenario` by `POST /api/ai/demo/:id`.

```json
{
  "active": true,
  "simulated": true,
  "id": "orthostatic",
  "title": "Düşük tansiyon ve hızlı nabız",
  "scope": "crew",
  "crewIds": ["crew-2"],
  "startedAt": "2026-11-15T05:41:44.368Z",
  "endsAt": "2026-11-15T05:41:59.368Z",
  "durationMs": 15000,
  "remainingMs": 11994,
  "progress": 0.2,
  "vitals": [{ "crewId": "crew-2", "type": "heartRate", "from": 66, "value": 115, "unit": "bpm" }],
  "cabin": [{ "metric": "contaminant", "from": 0.2, "value": 15.1, "unit": "ppm", "status": "red" }],
  "disclaimer": "Yapay zekâ önerisidir. Demo yazılımıdır, tıbbi cihaz değildir."
}
```

When nothing plays: `{ "active": false }`.

## Web (done in this change)

- Senaryolar tab: the scenario runs on the astronaut selected in the UI (the selector there is the same selection as the
  Astronotlar tab), a **Canlı veriler** panel shows from → live value, colour and a sparkline for every driven value.
- Astronotlar tab: a banner says a simulation is running for the selected astronaut; the vitals change live because they
  come from the same `sample` events.
- The alert popup no longer has the "AI'a sor" button (it did nothing outside the astronaut page). "AI önerisi" stays.

## iPhone and Watch (for the iOS developer)

Nothing is required for the values: the phone already applies `packet` events from `/api/stream`, so the dashboard
vitals change every second during a scenario, and the alert reaches the phone and the watch as before.

To show **"Simülasyon başladı"** at the moment the scenario starts, wire the new event (model already added in
`Shared/Models/ScenarioModels.swift`, `RelayScenarioState`). On the `features/fix_notifications` branch this is:

```swift
// NetworkManager.swift
enum RelayStreamEvent: Sendable {
    // ...existing cases...
    case scenario(RelayScenarioState)
}

// in parseRelaySSEEvent(name:data:)
case "scenario":
    guard let state = RelayScenarioState.decode(from: data) else { return nil }
    return .scenario(state)

// DashboardViewModel.swift
@Published var activeScenario: RelayScenarioState?

// in the relay stream switch (next to `case .packet`)
case .scenario(let state):
    self.applyScenario(state, crewId: targetCrewId)

@MainActor
private func applyScenario(_ state: RelayScenarioState, crewId: String) {
    let wasActive = activeScenario != nil
    activeScenario = state.concerns(crewId: crewId) ? state : nil
    guard let current = activeScenario else {
        if wasActive { forwardActiveAlertToWatch() } // ended: the watch goes back to the normal alert state
        return
    }
    if !wasActive {
        // local notification + watch banner once, at the start
        let content = UNMutableNotificationContent()
        content.title = current.bannerText
        content.body = "Değerler 15 saniye boyunca canlı değişecek (simüle edilmiş veri)."
        content.sound = .default
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: "antigravity.scenario.\(current.id ?? "demo")", content: content, trigger: nil)
        )
        ConnectivityManager.shared.sendAlertState(
            WatchAlertPayload(active: true, title: current.bannerText, detail: "Simüle edilmiş veri", severity: "amber")
        )
    }
}
```

And a banner on the dashboard while `activeScenario != nil`:

```swift
if let s = viewModel.activeScenario {
    Label("\(s.bannerText) · \(s.remainingSeconds ?? 0) sn", systemImage: "play.circle.fill")
        .font(.headline)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.25), in: RoundedRectangle(cornerRadius: 12))
}
```

The `hello` of `/api/stream` also carries `scenario`, so a phone that connects in the middle of a scenario can show the
banner too (add `let scenario: RelayScenarioState?` to `RelayHelloPayload`).
