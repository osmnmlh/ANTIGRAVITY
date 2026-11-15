//
//  NotificationController.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Combine
import Foundation
import UserNotifications

/// Sends local uppercase alert notifications and task alerts on Apple Watch
/// both when the Watch app is open (`willPresent`) and when woken in background.
@MainActor
final class NotificationController: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationController()

    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined

    private var hasSentCriticalWarning = false
    private var notifiedTaskIds = Set<String>()
    private var hasConfiguredDelegate = false

    override init() {
        super.init()
    }

    func requestAuthorization() {
        let center = UNUserNotificationCenter.current()
        if !hasConfiguredDelegate {
            hasConfiguredDelegate = true
            center.delegate = self
        }
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            Task { @MainActor [weak self] in
                self?.authorizationStatus = granted ? .authorized : .denied
            }
        }
    }

    /// Posts a single ALL CAPS local notification only when entering a critical (red) state.
    /// Non-critical threshold warnings (amber) do not emit notifications; repeated notifications
    /// during the same critical episode are suppressed until vitals return to normal.
    func sendThresholdWarning(title: String, body: String, signature: String, isCritical: Bool = true) {
        guard isCritical else { return }
        guard !hasSentCriticalWarning else { return }
        hasSentCriticalWarning = true

        let content = UNMutableNotificationContent()
        content.title = title.uppercased(with: Locale(identifier: "tr_TR"))
        content.body = body.uppercased(with: Locale(identifier: "tr_TR"))
        content.sound = .default
        if #available(watchOS 8.0, *) {
            content.interruptionLevel = .timeSensitive
        }

        let request = UNNotificationRequest(
            identifier: "antigravity.watch.alert.critical",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }

    /// Posts an immediate single Watch notification when a new Houston task arrives.
    func sendTaskNotification(id: String, title: String, details: String, urgent: Bool) {
        guard notifiedTaskIds.insert(id).inserted else { return }

        let content = UNMutableNotificationContent()
        content.title = urgent ? "🚨 ACİL GÖREV • İŞ BAŞINA!" : "🛰️ YENİ GÖREV • İŞ BAŞINA!"
        let trimmedDetails = details.trimmingCharacters(in: .whitespacesAndNewlines)
        content.body = trimmedDetails.isEmpty ? title : "\(title) — \(trimmedDetails)"
        content.sound = .default
        if #available(watchOS 8.0, *) {
            content.interruptionLevel = .timeSensitive
        }

        let request = UNNotificationRequest(
            identifier: "antigravity.watch.task.\(id)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }

    /// Resets single-alert state once the critical state clears.
    func clearAlertState() {
        hasSentCriticalWarning = false
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }
}
