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

        try? session.updateApplicationContext(payload)
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
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
