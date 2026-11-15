//
//  ConnectivityManager.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Combine
import Foundation
import WatchConnectivity

/// The alert the iPhone shows (a backend scenario or a health alert), mirrored to the paired Apple Watch.
struct WatchAlertPayload: Equatable, Sendable {
    let active: Bool
    let title: String
    let detail: String
    /// `red`, `amber` or `green` (nothing active).
    let severity: String
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
    /// Callback triggered on the main queue (Watch side) whenever the iPhone forwards its active alert.
    var onAlertReceived: ((WatchAlertPayload) -> Void)?

    private var lastSentAlert: WatchAlertPayload?

    /// iPhone -> Watch: the alert that is active right now (or `active == false` when everything is normal again).
    /// The application context keeps the latest state for a watch that is not reachable; a live message makes it instant.
    func sendAlertState(_ alert: WatchAlertPayload) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        guard alert != lastSentAlert else { return }
        lastSentAlert = alert

        let payload: [String: Any] = [
            "scenarioAlert": [
                "active": alert.active,
                "title": alert.title,
                "detail": alert.detail,
                "severity": alert.severity
            ]
        ]
        try? session.updateApplicationContext(payload)
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
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

        if let symptoms = payload["symptoms"] as? [String] {
            Task { @MainActor [weak self] in
                self?.latestSymptoms = symptoms
                self?.onSymptomsReceived?(symptoms)
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
