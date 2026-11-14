//
//  ConnectivityManager.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Combine
import Foundation
import WatchConnectivity

/// Shared WatchConnectivity bridge syncing `HealthSample` batches between Apple Watch and iPhone.
final class ConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = ConnectivityManager()

    @Published private(set) var isReachable: Bool = false
    @Published private(set) var lastSyncDate: Date?
    @Published private(set) var receivedSamples: [HealthSample] = []

    /// Callback triggered on the main queue whenever new Watch samples arrive.
    var onSamplesReceived: (([HealthSample]) -> Void)?

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

    func session(_ session: WCSession, didReceiveMessageData messageData: Data) {
        handleIncomingData(messageData)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        if let data = userInfo["samples"] as? Data {
            handleIncomingData(data)
        } else if let data = userInfo["sample"] as? Data {
            handleIncomingData(data)
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
