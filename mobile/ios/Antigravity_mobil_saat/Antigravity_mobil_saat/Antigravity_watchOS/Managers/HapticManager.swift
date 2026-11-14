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
    private var currentUrgent = false

    /// Starts repeating wrist haptics. Urgent (.red) alerts pulse faster than warning (.amber) alerts.
    func startContinuousAlert(urgent: Bool) {
        if isVibrating && currentUrgent == urgent {
            return
        }

        stopTimer()
        currentUrgent = urgent
        isVibrating = true
        playPulse()

        let interval: TimeInterval = urgent ? 0.65 : 1.15
        let newTimer = Timer(timeInterval: interval, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.playPulse()
            }
        }
        newTimer.tolerance = 0.05
        RunLoop.main.add(newTimer, forMode: .common)
        timer = newTimer
    }

    /// Stops repeating wrist vibrations immediately.
    func stopContinuousAlert() {
        stopTimer()
        if isVibrating {
            isVibrating = false
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func playPulse() {
        #if os(watchOS)
        WKInterfaceDevice.current().play(currentUrgent ? .failure : .notification)
        #endif
    }
}
