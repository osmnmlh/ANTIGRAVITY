# mobile/ios/ — iPhone + Apple Watch apps

One Xcode project for both (the watchOS target must still be added in Xcode; until then Watch files compile into the app target): `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat.xcodeproj` (Xcode 16+, iPhone 16 Pro / iOS 18, watchOS 11).

- iPhone sources: `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Antigravity_iOS/`
- Watch sources: `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Antigravity_watchOS/`
- Shared by both targets: `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/`
- Data contract + status engine: `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/Models/HealthModels.swift`, `Thresholds.swift`. They sit in the synchronized folder, so they compile automatically. Status colors come only from `Thresholds.swift`.

Backend base URL (ADR-0004, one constant in the app): `https://antigravity-backend-8lv8.onrender.com`. Silent fallback to the bundled `shared/mock/astronaut-packets.json`. UI text in Turkish (ADR-0005).

Status (14 Nov): nobody has confirmed yet that `main` builds in Xcode, the watchOS target is not created, and there is no `WCSession` code yet (#16, #17).

Agents: see skills `ios-watch-connectivity`, `watchos-app`.
