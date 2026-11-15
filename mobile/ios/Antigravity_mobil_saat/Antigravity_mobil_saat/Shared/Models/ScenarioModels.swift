import Foundation

// Demo scenario that the web "Senaryolar" tab started (backend/ai/index.mjs).
// The relay sends it as SSE `event: scenario` on BOTH /api/stream and /api/ai/stream, and inside their `hello`
// (`scenario` key). While it plays (15 s by default) the relay also moves the astronaut's vitals once a second through
// the normal `packet` events, so the dashboard values change live without any extra code.
// See docs/scenario-live-sync.md for how to wire this into NetworkManager / DashboardViewModel.
// Demo software, not a medical device: every value in a scenario is simulated.

/// One vital the scenario drives for one astronaut: `from` is the value before the scenario, `value` the live one.
struct RelayScenarioVital: Codable, Sendable, Equatable {
    let crewId: String
    let type: String
    let from: Double
    let value: Double
    let unit: String
}

/// `active == false` means no scenario is playing (sent once when it ends, after the values are back to normal).
struct RelayScenarioState: Codable, Sendable, Equatable {
    let active: Bool
    let id: String?
    /// Turkish title, e.g. "Kabinde gaz sızıntısı".
    let title: String?
    /// `cabin` (everyone in the cabin) or `crew` (one astronaut).
    let scope: String?
    let crewIds: [String]?
    /// ISO 8601 strings, kept as text so any relay date format decodes.
    let startedAt: String?
    let endsAt: String?
    let durationMs: Double?
    let remainingMs: Double?
    let vitals: [RelayScenarioVital]?

    /// True when this astronaut's phone should show "Simülasyon başladı".
    func concerns(crewId: String) -> Bool {
        active && (crewIds ?? []).contains(crewId)
    }

    /// Seconds left, rounded up (nil when the relay did not send a duration).
    var remainingSeconds: Int? {
        guard let remainingMs else { return nil }
        return Int((remainingMs / 1000).rounded(.up))
    }

    /// Short Turkish banner text for the iPhone and the Watch.
    var bannerText: String {
        "Simülasyon başladı: \(title ?? id ?? "Senaryo")"
    }

    /// The live vitals of one astronaut in this scenario.
    func vitals(for crewId: String) -> [RelayScenarioVital] {
        (vitals ?? []).filter { $0.crewId == crewId }
    }

    static func decode(from json: String) -> RelayScenarioState? {
        guard let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(RelayScenarioState.self, from: data)
    }
}
