---
name: ios-watch-connectivity
description: Build the iPhone 16 Pro companion app in mobile/ios/ with SwiftUI and sync data with the Apple Watch via WatchConnectivity (WCSession). Use for iPhone app work or anything about phone-watch communication.
---

# iPhone App + WatchConnectivity (mobile/ios/)

iPhone = **hub**: receives watch samples, stores history, shows trends/guidance, accepts manual entries (BP, glucose, temp, sleep).

## Setup

- One Xcode project `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat.xcodeproj` with targets: iOS app (iOS 18, iPhone 16 Pro, sources `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Antigravity_iOS/`) and Watch App (sources `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Antigravity_watchOS/`).
- Shared files (target membership on both): `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/Models/HealthModels.swift`, `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/Models/Thresholds.swift`, plus `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/` (put `ConnectivityManager.swift` there).
- Persistence: SwiftData or a JSON file in Documents. Pick the faster one for you; no CloudKit, no backend.

## WatchConnectivity (one manager, both sides)

```swift
import WatchConnectivity

final class ConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = ConnectivityManager()
    @Published var received: [HealthSample] = []

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func send(_ sample: HealthSample) {
        guard let data = try? JSONEncoder().encode(sample) else { return }
        let s = WCSession.default
        if s.isReachable {
            s.sendMessageData(data, replyHandler: nil) { _ in s.transferUserInfo(["sample": data]) }
        } else {
            s.transferUserInfo(["sample": data])   // queued, delivered later
        }
    }

    func session(_ s: WCSession, didReceiveMessageData data: Data) { handle(data) }
    func session(_ s: WCSession, didReceiveUserInfo info: [String: Any] = [:]) {
        if let d = info["sample"] as? Data { handle(d) }
    }
    private func handle(_ data: Data) {
        guard let sample = try? JSONDecoder().decode(HealthSample.self, from: data) else { return }
        DispatchQueue.main.async { self.received.append(sample) }
    }
    func session(_ s: WCSession, activationDidCompleteWith st: WCSessionActivationState, error: Error?) {}
    #if os(iOS)
    func sessionDidBecomeInactive(_ s: WCSession) {}
    func sessionDidDeactivate(_ s: WCSession) { WCSession.default.activate() }
    #endif
}
```

- Use `sendMessageData` for live (both apps foreground), `transferUserInfo` for guaranteed queued delivery, `updateApplicationContext` for "latest status" phone → watch.
- Call `activate()` in each app's `init`/`App` body at launch.

## AI recommendation (from backend)

- `AstronautHealthPacket.aiGuidance` (optional) is filled by `backend/` via Gemini. Decode it with `HealthJSONCodec.decoder` and show it as an **"AI recommendation"** card: `summary`, `actions` as bullets, `escalate`, and `disclaimer`. Hide the card when it is `nil`.
- Get packets from the relay (`GET http://<mac-ip>:8787/api/packets/<crewId>`) or from the bundled `shared/mock/astronaut-packets.json`; always keep the bundled mock as fallback.
- Plain HTTP to a LAN IP needs `NSAppTransportSecurity` → `NSAllowsLocalNetworking = YES` and a `NSLocalNetworkUsageDescription` in Info.plist. The simulator on the demo Mac can just use `http://localhost:8787`.
- Never put the Gemini key in the app; color/status still comes from `HealthThresholds`, not from the AI text.

## Rules

- `HealthSample` is `Codable` and matches the JSON contract in AGENTS.md exactly (camelCase keys, ISO-8601 dates via `.iso8601` strategy).
- Testing: run iOS + paired Watch simulator together (scheme with both). If sync is flaky in the simulator, keep a "Load mock data" button so the demo never depends on it.
- Optional bonus: export JSON so the web dashboard can import the same data.
- Done = a watch check-in appears on the phone within seconds in the simulator pair.
