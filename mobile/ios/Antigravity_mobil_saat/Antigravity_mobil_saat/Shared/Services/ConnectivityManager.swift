//
//  ConnectivityManager.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Combine
import Foundation
import WatchConnectivity

struct RemoteWatchTelemetryPayload: Sendable {
    let heartRate: Int
    let spo2: Int?
    let bodyTemp: Double?
    let overallStatus: HealthStatus
    let alertTitle: String?
    let timestamp: Date
}

/// The alert the iPhone shows (a backend scenario or a health alert), mirrored to the paired Apple Watch.
struct WatchAlertPayload: Equatable, Sendable {
    let active: Bool
    let title: String
    let detail: String
    /// `red`, `amber` or `green` (nothing active).
    let severity: String
}

/// A Houston mission task pushed from iPhone to Apple Watch so Watch notifies even when closed or backgrounded.
struct WatchTaskNotificationPayload: Equatable, Sendable {
    let id: String
    let title: String
    let details: String
    let urgent: Bool
}

/// Shared WatchConnectivity bridge syncing `HealthSample` batches between Apple Watch and iPhone.
final class ConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = ConnectivityManager()

    @Published private(set) var isReachable: Bool = false
    @Published private(set) var lastSyncDate: Date?
    @Published private(set) var receivedSamples: [HealthSample] = []
    @Published private(set) var latestSymptoms: [String] = []

    /// Callback triggered on the main queue whenever new Watch samples arrive.
    var onSamplesReceived: (([HealthSample]) -> Void)?
    /// Callback triggered on the main queue whenever Watch symptom check-ins arrive.
    var onSymptomsReceived: (([String]) -> Void)?
    /// Callback triggered on the main queue on Apple Watch whenever iPhone forwards live Web/backend vitals.
    var onRemoteTelemetryReceived: ((RemoteWatchTelemetryPayload) -> Void)?
    /// Callback triggered on the main queue (Watch side) whenever the iPhone forwards its active alert.
    var onAlertReceived: ((WatchAlertPayload) -> Void)?
    /// Callback triggered on the main queue (Watch side) whenever iPhone forwards a new Houston task.
    var onTaskReceived: ((WatchTaskNotificationPayload) -> Void)?

    private var lastSentAlert: WatchAlertPayload?
    private var lastBackgroundTelemetryStatus: HealthStatus = .green
    private var latestApplicationContext: [String: Any] = [:]

    /// iPhone -> Watch: the alert that is active right now (or `active == false` when everything is normal again).
    /// Merged `applicationContext` preserves both telemetry and active alert, while `sendMessage` / `transferUserInfo` delivers immediately.
    func sendAlertState(_ alert: WatchAlertPayload) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        guard alert != lastSentAlert else { return }
        lastSentAlert = alert

        let alertDict: [String: Any] = [
            "active": alert.active,
            "title": alert.title,
            "detail": alert.detail,
            "severity": alert.severity
        ]
        latestApplicationContext["scenarioAlert"] = alertDict
        try? session.updateApplicationContext(latestApplicationContext)

        let payload: [String: Any] = ["scenarioAlert": alertDict]
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil) { _ in
                if alert.active {
                    session.transferUserInfo(payload)
                }
            }
        } else if alert.active {
            session.transferUserInfo(payload)
        }
    }

    /// iPhone -> Watch: forwards a newly assigned Houston task to Watch.
    func sendTaskNotificationToWatch(id: String, title: String, details: String, urgent: Bool) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }

        let payload: [String: Any] = [
            "watchTask": [
                "id": id,
                "title": title,
                "details": details,
                "urgent": urgent
            ]
        ]
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil) { _ in
                session.transferUserInfo(payload)
            }
        } else {
            session.transferUserInfo(payload)
        }
    }

    /// Sends Watch vital samples alongside reported symptoms to the paired iPhone.
    func sendQuickCheckIn(samples: [HealthSample], symptoms: [String]) {
        guard let data = try? HealthJSONCodec.encoder.encode(samples) else { return }
        guard WCSession.isSupported() else { return }

        let session = WCSession.default
        guard session.activationState == .activated else { return }

        let payload: [String: Any] = [
            "samples": data,
            "symptoms": symptoms
        ]
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil) { _ in
                session.transferUserInfo(payload)
            }
        } else {
            session.transferUserInfo(payload)
        }
    }

    private override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        if session.activationState != .activated {
            session.activate()
        }
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }

    func sendSample(_ sample: HealthSample) {
        sendSamples([sample])
    }

    /// Forwards live backend/Web vitals and alert state from iPhone to the paired Apple Watch.
    func sendRemoteTelemetryToWatch(
        heartRate: Double,
        spo2: Double?,
        bodyTemp: Double?,
        overallStatus: HealthStatus,
        alertTitle: String?
    ) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }

        var payload: [String: Any] = [
            "remoteHeartRate": Int(heartRate.rounded()),
            "remoteOverallStatus": overallStatus.rawValue,
            "remoteTimestamp": Date().timeIntervalSince1970
        ]
        if let spo2 {
            payload["remoteSpo2"] = Int(spo2.rounded())
        }
        if let bodyTemp {
            payload["remoteBodyTemp"] = bodyTemp
        }
        if let alertTitle, !alertTitle.isEmpty {
            payload["remoteAlertTitle"] = alertTitle
        }

        for (key, value) in payload {
            latestApplicationContext[key] = value
        }
        try? session.updateApplicationContext(latestApplicationContext)
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil) { [weak self] _ in
                guard let self else { return }
                if overallStatus == .amber || overallStatus == .red,
                   self.lastBackgroundTelemetryStatus != overallStatus {
                    self.lastBackgroundTelemetryStatus = overallStatus
                    session.transferUserInfo(payload)
                }
            }
            if overallStatus == .green {
                lastBackgroundTelemetryStatus = .green
            }
        } else if overallStatus == .amber || overallStatus == .red {
            if lastBackgroundTelemetryStatus != overallStatus {
                lastBackgroundTelemetryStatus = overallStatus
                session.transferUserInfo(payload)
            }
        } else {
            lastBackgroundTelemetryStatus = .green
        }
    }

    func sendSamples(_ samples: [HealthSample]) {
        guard !samples.isEmpty else { return }
        guard WCSession.isSupported() else { return }
        guard let data = try? HealthJSONCodec.encoder.encode(samples) else { return }

        let session = WCSession.default
        if session.activationState != .activated {
            session.activate()
        }

        if session.isReachable {
            session.sendMessageData(data, replyHandler: nil) { _ in
                session.transferUserInfo(["samples": data])
            }
        } else {
            session.transferUserInfo(["samples": data])
        }

        DispatchQueue.main.async {
            self.lastSyncDate = Date()
        }
    }

    // MARK: - WCSessionDelegate

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        DispatchQueue.main.async {
            self.isReachable = (activationState == .activated) && session.isReachable
        }
        if activationState == .activated, !session.receivedApplicationContext.isEmpty {
            handleIncomingPayload(session.receivedApplicationContext)
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handleIncomingPayload(message)
    }

    func session(_ session: WCSession, didReceiveMessageData messageData: Data) {
        handleIncomingData(messageData)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        handleIncomingPayload(userInfo)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        handleIncomingPayload(applicationContext)
    }

    private func handleIncomingPayload(_ payload: [String: Any]) {
        if let data = payload["samples"] as? Data {
            handleIncomingData(data)
        } else if let data = payload["sample"] as? Data {
            handleIncomingData(data)
        }

        if let dict = payload["scenarioAlert"] as? [String: Any], let active = dict["active"] as? Bool {
            let alert = WatchAlertPayload(
                active: active,
                title: dict["title"] as? String ?? "",
                detail: dict["detail"] as? String ?? "",
                severity: dict["severity"] as? String ?? "red"
            )
            DispatchQueue.main.async { [weak self] in
                self?.onAlertReceived?(alert)
            }
        }

        if let dict = payload["watchTask"] as? [String: Any],
           let id = dict["id"] as? String,
           let title = dict["title"] as? String {
            let task = WatchTaskNotificationPayload(
                id: id,
                title: title,
                details: dict["details"] as? String ?? "",
                urgent: dict["urgent"] as? Bool ?? false
            )
            DispatchQueue.main.async { [weak self] in
                self?.onTaskReceived?(task)
            }
        }

        if let symptoms = payload["symptoms"] as? [String] {
            Task { @MainActor [weak self] in
                self?.latestSymptoms = symptoms
                self?.onSymptomsReceived?(symptoms)
            }
        }

        if let heartRate = payload["remoteHeartRate"] as? Int,
           let statusRaw = payload["remoteOverallStatus"] as? String {
            let spo2 = payload["remoteSpo2"] as? Int
            let bodyTemp = payload["remoteBodyTemp"] as? Double
            let alertTitle = payload["remoteAlertTitle"] as? String
            let ts = (payload["remoteTimestamp"] as? TimeInterval).map(Date.init(timeIntervalSince1970:)) ?? Date()
            let status = HealthStatus(rawValue: statusRaw) ?? .green
            let remote = RemoteWatchTelemetryPayload(
                heartRate: heartRate,
                spo2: spo2,
                bodyTemp: bodyTemp,
                overallStatus: status,
                alertTitle: alertTitle,
                timestamp: ts
            )
            Task { @MainActor [weak self] in
                self?.lastSyncDate = ts
                self?.onRemoteTelemetryReceived?(remote)
            }
        }
    }

    #if os(iOS)
    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
    #endif

    // MARK: - Private

    private func handleIncomingData(_ data: Data) {
        let decoded: [HealthSample]
        if let batch = try? HealthJSONCodec.decoder.decode([HealthSample].self, from: data) {
            decoded = batch
        } else if let single = try? HealthJSONCodec.decoder.decode(HealthSample.self, from: data) {
            decoded = [single]
        } else {
            return
        }

        guard !decoded.isEmpty else { return }

        DispatchQueue.main.async {
            self.receivedSamples.append(contentsOf: decoded)
            self.lastSyncDate = Date()
            self.onSamplesReceived?(decoded)
        }
    }
}
