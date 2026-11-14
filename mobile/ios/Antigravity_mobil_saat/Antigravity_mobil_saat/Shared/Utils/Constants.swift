//
//  Constants.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation

enum Constants {
    // Live backend relay on Render (ADR-0004 & ADR-0006).
    // Swap this single constant to http://<mac-ip>:8787 if using Plan B local relay.
    static let apiBaseURL = "https://antigravity-backend-8lv8.onrender.com"
    static let defaultCrewId = "crew-2"

    private static let deviceIdStorageKey = "antigravity.deviceId"

    /// Stable per-install UUID used to register this phone on `/api/ai/stream` and acknowledge alerts.
    static var deviceId: String {
        if let existing = UserDefaults.standard.string(forKey: deviceIdStorageKey), !existing.isEmpty {
            return existing
        }
        let generated = UUID().uuidString
        UserDefaults.standard.set(generated, forKey: deviceIdStorageKey)
        return generated
    }

    static var healthURL: URL? {
        URL(string: "\(apiBaseURL)/api/health")
    }

    static var samplesURL: URL? {
        URL(string: "\(apiBaseURL)/api/samples")
    }

    static var aiGuidanceURL: URL? {
        URL(string: "\(apiBaseURL)/api/ai/guidance")
    }

    static func packetURL(crewId: String = defaultCrewId) -> URL? {
        let encoded = crewId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? crewId
        return URL(string: "\(apiBaseURL)/api/packets/\(encoded)")
    }

    static func aiStreamURL(deviceId: String = Self.deviceId, crewId: String = defaultCrewId) -> URL? {
        var components = URLComponents(string: "\(apiBaseURL)/api/ai/stream")
        components?.queryItems = [
            URLQueryItem(name: "deviceId", value: deviceId),
            URLQueryItem(name: "crewId", value: crewId),
            URLQueryItem(name: "platform", value: "ios"),
            URLQueryItem(name: "name", value: "iPhone")
        ]
        return components?.url
    }

    static func alertDeliveredURL(alertId: String) -> URL? {
        let encoded = alertId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? alertId
        return URL(string: "\(apiBaseURL)/api/ai/alerts/\(encoded)/delivered")
    }

    static func alertAckURL(alertId: String) -> URL? {
        let encoded = alertId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? alertId
        return URL(string: "\(apiBaseURL)/api/ai/alerts/\(encoded)/ack")
    }

    // Sağlık eşikleri burada TUTULMAZ: HealthThresholds (Shared/Models/Thresholds.swift) tek kaynaktır.
    static let welcomeMessage = "Sistemler Normal, Kaptan."
    static let turkishDemoDisclaimer = "Demo yazılımıdır, tıbbi cihaz değildir."
}
