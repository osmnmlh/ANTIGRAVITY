//
//  NotificationController.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Combine
import Foundation
import UserNotifications

/// Sends local uppercase alert notifications on Apple Watch when a health threshold is exceeded.
@MainActor
final class NotificationController: ObservableObject {
    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined

    private var lastSentSignature: String?

    func requestAuthorization() {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            Task { @MainActor [weak self] in
                self?.authorizationStatus = granted ? .authorized : .denied
            }
        }
    }

    /// Posts an immediate ALL CAPS local notification when entering a new warning/critical state.
    func sendThresholdWarning(title: String, body: String, signature: String) {
        guard lastSentSignature != signature else { return }
        lastSentSignature = signature

        let content = UNMutableNotificationContent()
        content.title = title.uppercased(with: Locale(identifier: "tr_TR"))
        content.body = body.uppercased(with: Locale(identifier: "tr_TR"))
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "antigravity.watch.alert.\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }

    /// Resets deduplication state once all vitals return to green.
    func clearAlertState() {
        lastSentSignature = nil
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }
}
