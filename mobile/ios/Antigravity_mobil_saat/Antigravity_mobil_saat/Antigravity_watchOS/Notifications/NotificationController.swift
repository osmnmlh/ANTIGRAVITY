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

    private var lastSentSignature: String?
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

    /// Posts an immediate ALL CAPS local notification when entering a new warning/critical state.
    func sendThresholdWarning(title: String, body: String, signature: String, isCritical: Bool = true) {
        guard lastSentSignature != signature else { return }
        lastSentSignature = signature

        let content = UNMutableNotificationContent()
        content.title = title.uppercased(with: Locale(identifier: "tr_TR"))
        content.body = body.uppercased(with: Locale(identifier: "tr_TR"))
        content.sound = .default
        if #available(watchOS 8.0, *) {
            content.interruptionLevel = isCritical ? .timeSensitive : .active
        }

        let request = UNNotificationRequest(
            identifier: "antigravity.watch.alert.\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }

    /// Posts an immediate Watch notification when a new Houston task arrives.
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

    /// Resets deduplication state once all vitals return to green.
    func clearAlertState() {
        lastSentSignature = nil
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }
}
