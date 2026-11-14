# mobile/ios/ — iPhone + Apple Watch apps

One Xcode project for both (the watchOS target must still be added in Xcode; until then Watch files compile into the app target): `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat.xcodeproj` (Xcode 16+, iPhone 16 Pro / iOS 18, watchOS 11).

- iPhone sources: `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Antigravity_iOS/`
- Watch sources: `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Antigravity_watchOS/`
- Shared by both targets: `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/`
- Data contract + status engine: `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/Models/HealthModels.swift`, `Thresholds.swift`. They sit in the synchronized folder, so they compile automatically. Status colors come only from `Thresholds.swift`.

Agents: see skills `ios-watch-connectivity`, `watchos-app`.
