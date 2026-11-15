//
//  PhoneAlertCoordinator.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 15.11.2026.
//

import Combine
import Foundation
import UserNotifications

/// Coordinates iOS local notifications (including foreground banner presentation & tap routing)
/// for Houston missions, health alerts, and scenarios. Haptic vibration is handled exclusively on Apple Watch.
@MainActor
final class PhoneAlertCoordinator: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    static let shared = PhoneAlertCoordinator()

    @Published var requestedTab: AppTab?

    private var hasConfiguredCenter = false
    private var hasSentCriticalAlertInEpisode = false

    private override init() {
        super.init()
    }

    // MARK: - Notification Setup

    func configureAndRequestAuthorization() {
        let center = UNUserNotificationCenter.current()
        if !hasConfiguredCenter {
            hasConfiguredCenter = true
            center.delegate = self

            let missionCategory = UNNotificationCategory(
                identifier: "ANTIGRAVITY_MISSION",
                actions: [],
                intentIdentifiers: [],
                options: [.customDismissAction]
            )
            let dangerCategory = UNNotificationCategory(
                identifier: "ANTIGRAVITY_CRITICAL",
                actions: [],
                intentIdentifiers: [],
                options: [.customDismissAction]
            )
            center.setNotificationCategories([missionCategory, dangerCategory])
        }

        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    // MARK: - Domain Notification Triggers

    func notifyHoustonTask(id: String, title: String, details: String, urgent: Bool) {
        let trimmedDetails = details.trimmingCharacters(in: .whitespacesAndNewlines)
        let notificationTitle = urgent
            ? "🚨 Acil Houston Görevi • İş Başına!"
            : "🛰️ Yeni Görev Geldi • İş Başına!"
        let notificationBody = trimmedDetails.isEmpty
            ? "Houston talimatı: \(title)"
            : "\(title) — \(trimmedDetails)"

        scheduleNotification(
            identifier: "antigravity.task.\(id)",
            title: notificationTitle,
            body: notificationBody,
            categoryIdentifier: "ANTIGRAVITY_MISSION",
            timeSensitive: true,
            targetTab: .missions
        )
    }

    func notifyAiAlert(id: String, title: String, spokenText: String, severity: HealthStatus) {
        guard severity == .red else { return }
        guard !hasSentCriticalAlertInEpisode else { return }
        hasSentCriticalAlertInEpisode = true

        scheduleNotification(
            identifier: "antigravity.alert.critical",
            title: "🔴 KRİTİK TEHLİKE • \(title)",
            body: "\(spokenText) Acil müdahale gerekiyor!",
            categoryIdentifier: "ANTIGRAVITY_CRITICAL",
            timeSensitive: true,
            targetTab: .dashboard
        )
    }

    func notifyStatusEscalation(severity: HealthStatus, summary: String) {
        guard severity == .red else { return }
        guard !hasSentCriticalAlertInEpisode else { return }
        hasSentCriticalAlertInEpisode = true

        scheduleNotification(
            identifier: "antigravity.alert.critical",
            title: "🔴 KRİTİK TEHLİKE • İŞ BAŞINA!",
            body: "\(summary) Acil müdahale protokolünü başlatın!",
            categoryIdentifier: "ANTIGRAVITY_CRITICAL",
            timeSensitive: true,
            targetTab: .dashboard
        )
    }

    func resetCriticalAlertEpisode() {
        hasSentCriticalAlertInEpisode = false
    }

    // MARK: - UNUserNotificationCenter Scheduling & Delegate

    private func scheduleNotification(
        identifier: String,
        title: String,
        body: String,
        categoryIdentifier: String,
        timeSensitive: Bool,
        targetTab: AppTab
    ) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.categoryIdentifier = categoryIdentifier
        content.userInfo = ["targetTab": targetTab.rawValue]
        if #available(iOS 15.0, *) {
            content.interruptionLevel = timeSensitive ? .timeSensitive : .active
        }

        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound, .badge]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let rawTab = response.notification.request.content.userInfo["targetTab"] as? String
        await MainActor.run {
            if let rawTab, let tab = AppTab(rawValue: rawTab) {
                self.requestedTab = tab
            }
        }
    }
}
