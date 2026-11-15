//
//  HapticManager.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Combine
import Foundation
#if os(watchOS)
import WatchKit
#endif

/// Drives continuous haptic wrist alerts on Apple Watch while a vital sign
/// threshold is breached, until vitals normalize or the astronaut mutes the alert.
@MainActor
final class HapticManager: ObservableObject {
    @Published private(set) var isVibrating = false

    private var timer: Timer?
    private var burstTasks: [Task<Void, Never>] = []
    private var currentUrgent = false

    /// Starts repeating wrist haptics.
    /// - Mild breaches (`urgent == false` / amber): gentle single reminder every 4.0s.
    /// - Critical breaches (`urgent == true` / red): intense multi-tap alarm burst every 0.85s.
    func startContinuousAlert(urgent: Bool) {
        if isVibrating && currentUrgent == urgent {
            return
        }

        stopTimer()
        cancelBurstTasks()
        currentUrgent = urgent
        isVibrating = true
        playCycle(initialEntry: true)

        let interval: TimeInterval = urgent ? 0.85 : 4.0
        let newTimer = Timer(timeInterval: interval, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.playCycle(initialEntry: false)
            }
        }
        newTimer.tolerance = 0.05
        RunLoop.main.add(newTimer, forMode: .common)
        timer = newTimer
    }

    /// Plays a discrete haptic tap/burst when a new Houston task arrives.
    func playTaskAlert(urgent: Bool) {
        #if os(watchOS)
        if urgent {
            playCriticalBurst()
        } else {
            WKInterfaceDevice.current().play(.notification)
        }
        #endif
    }

    /// Stops repeating wrist vibrations immediately.
    func stopContinuousAlert() {
        stopTimer()
        cancelBurstTasks()
        if isVibrating {
            isVibrating = false
        }
    }

    /// Pauses the foreground haptic loop when watchOS backgrounds or suspends the app
    /// so `isVibrating` does not stay stale when the user raises their wrist again.
    func pauseForBackground() {
        stopContinuousAlert()
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func cancelBurstTasks() {
        for task in burstTasks {
            task.cancel()
        }
        burstTasks.removeAll()
    }

    private func playCycle(initialEntry: Bool) {
        #if os(watchOS)
        if currentUrgent {
            playCriticalBurst()
        } else {
            // Mild threshold breach ("biraz çıkarsa az titresin"): gentle tap
            WKInterfaceDevice.current().play(initialEntry ? .directionUp : .click)
        }
        #endif
    }

    private func playCriticalBurst() {
        #if os(watchOS)
        cancelBurstTasks()
        WKInterfaceDevice.current().play(.failure)
        for (index, delayNs) in [160_000_000 as UInt64, 320_000_000 as UInt64].enumerated() {
            let hapticType: WKHapticType = (index == 0) ? .notification : .failure
            let task = Task { @MainActor in
                try? await Task.sleep(nanoseconds: delayNs)
                guard !Task.isCancelled else { return }
                WKInterfaceDevice.current().play(hapticType)
            }
            burstTasks.append(task)
        }
        #endif
    }
}
