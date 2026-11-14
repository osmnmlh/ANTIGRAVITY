---
name: watchos-app
description: Build the watchOS app in watch/ with SwiftUI and HealthKit - live heart rate, quick mood/symptom check-in, status glance, sending samples to the iPhone. Use for any Apple Watch work.
---

# watchOS App (watch/)

The watch is the **sensor + 5-second check-in**. Keep it to 2-3 screens.

## Setup

- Xcode 16+, watchOS 11 target, SwiftUI only. The Xcode project is in `mobile/ios/`; this folder holds the Watch App target's sources (add as folder reference).
- Watch App target is a companion of the iOS app (same bundle id prefix: `<ios-bundle-id>.watchkitapp`).
- Capabilities: **HealthKit** on both watch and iOS targets. Info.plist: `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`.

## Screens

1. **Status**: big overall color + current HR + last sync time.
2. **Check-in**: mood 1-5 (Digital Crown or 5 buttons), optional symptom chips (headache, nausea, fatigue, back pain). One tap sends.
3. (Optional) **Measure**: start a short `HKWorkoutSession` to stream live heart rate.

## Heart rate

```swift
let store = HKHealthStore()
let hr = HKQuantityType(.heartRate)
try await store.requestAuthorization(toShare: [], read: [hr, HKQuantityType(.oxygenSaturation)])
// Latest value: HKSampleQueryDescriptor sorted by endDate desc, limit 1
// Live: HKWorkoutSession + HKLiveWorkoutBuilder, read statistics(for: hr)?.mostRecentQuantity()
let bpm = quantity.doubleValue(for: .count().unitDivided(by: .minute()))
```

## Rules

- Map every reading to the shared `HealthSample` (see AGENTS.md) and send via `ios-watch-connectivity` skill.
- **Simulator has no real HR**: provide a `MockHeartRateProvider` (55-85 bpm + scripted spike) behind a protocol, toggle with a debug flag. Demo must work on simulator.
- Thresholds/status come from a shared `Thresholds.swift` (same values as `astronaut-health-domain`); share the file between iOS and watch targets via target membership.
- Large text, one action per screen, no scrolling lists longer than 5 items.
- Done = builds and runs in the paired watch simulator, check-in reaches the iPhone.
