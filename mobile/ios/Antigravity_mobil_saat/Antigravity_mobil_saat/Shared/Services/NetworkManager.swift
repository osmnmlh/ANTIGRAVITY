//
//  NetworkManager.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation

enum NetworkError: LocalizedError {
    case invalidURL
    case badResponse(statusCode: Int)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Geçersiz sunucu adresi."
        case .badResponse(let statusCode):
            return "Sunucu beklenmeyen bir yanıt döndürdü (HTTP \(statusCode))."
        }
    }
}

struct BackendHealthResponse: Codable, Sendable {
    let ok: Bool
    let gemini: Bool
    let model: String?
    let clients: Int?
    let ai: Bool?
}

enum AiStreamEvent: Sendable {
    case hello(alerts: [AiAlert])
    case alert(AiAlert)
    case alertUpdate(AiAlert)
}

private struct SamplesPostResponse: Codable {
    let packets: [AstronautHealthPacket]
}

private struct GuidanceRequestBody: Encodable {
    let crewId: String
}

private struct AlertDeviceBody: Encodable {
    let deviceId: String
}

/// Handles REST and SSE communication between the iPhone companion app and the Render backend.
final class NetworkManager {
    static let shared = NetworkManager()

    private let session: URLSession

    private init(session: URLSession = .shared) {
        self.session = session
    }

    /// Checks whether the Render relay backend is awake and ready.
    func checkHealth() async throws -> BackendHealthResponse {
        guard let url = Constants.healthURL else { throw NetworkError.invalidURL }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        return try HealthJSONCodec.decoder.decode(BackendHealthResponse.self, from: data)
    }

    /// Fetches the latest astronaut health packet (including `aiGuidance`) via `GET /api/packets/:crewId`.
    func fetchPacket(crewId: String = Constants.defaultCrewId) async throws -> AstronautHealthPacket {
        guard let url = Constants.packetURL(crewId: crewId) else { throw NetworkError.invalidURL }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        return try HealthJSONCodec.decoder.decode(AstronautHealthPacket.self, from: data)
    }

    /// Forwards canonical `HealthSample` records to the backend via `POST /api/samples`.
    @discardableResult
    func sendSamples(_ samples: [HealthSample]) async throws -> [AstronautHealthPacket] {
        guard !samples.isEmpty else { return [] }
        guard let url = Constants.samplesURL else { throw NetworkError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try HealthJSONCodec.encoder.encode(samples)

        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        let decoded = try HealthJSONCodec.decoder.decode(SamplesPostResponse.self, from: data)
        return decoded.packets
    }

    /// Requests refreshed Gemini/fallback guidance via `POST /api/ai/guidance`.
    func requestAiGuidance(crewId: String = Constants.defaultCrewId) async throws -> AiGuidance {
        guard let url = Constants.aiGuidanceURL else { throw NetworkError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 25
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(GuidanceRequestBody(crewId: crewId))

        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        return try HealthJSONCodec.decoder.decode(AiGuidance.self, from: data)
    }

    /// Confirms alert delivery via `POST /api/ai/alerts/:id/delivered`.
    @discardableResult
    func markAlertDelivered(alertId: String, deviceId: String = Constants.deviceId) async throws -> AiAlert {
        guard let url = Constants.alertDeliveredURL(alertId: alertId) else { throw NetworkError.invalidURL }
        return try await postAlertDeviceAction(url: url, deviceId: deviceId)
    }

    /// Acknowledges an active alert via `POST /api/ai/alerts/:id/ack`.
    @discardableResult
    func acknowledgeAlert(alertId: String, deviceId: String = Constants.deviceId) async throws -> AiAlert {
        guard let url = Constants.alertAckURL(alertId: alertId) else { throw NetworkError.invalidURL }
        return try await postAlertDeviceAction(url: url, deviceId: deviceId)
    }

    /// Opens an SSE connection to `GET /api/ai/stream` and emits decoded `AiStreamEvent`s while active.
    func streamAiEvents(
        deviceId: String = Constants.deviceId,
        crewId: String = Constants.defaultCrewId
    ) -> AsyncStream<AiStreamEvent> {
        AsyncStream { continuation in
            let task = Task {
                guard let url = Constants.aiStreamURL(deviceId: deviceId, crewId: crewId) else {
                    continuation.finish()
                    return
                }

                while !Task.isCancelled {
                    do {
                        var request = URLRequest(url: url)
                        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                        request.timeoutInterval = 90

                        let (bytes, response) = try await session.bytes(for: request)
                        try validate(response: response)

                        var currentEvent = ""
                        var currentData = ""

                        for try await line in bytes.lines {
                            if Task.isCancelled { break }
                            if line.isEmpty {
                                if !currentData.isEmpty, let parsed = Self.parseSSEEvent(name: currentEvent, data: currentData) {
                                    continuation.yield(parsed)
                                }
                                currentEvent = ""
                                currentData = ""
                            } else if line.hasPrefix("event:") {
                                currentEvent = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
                            } else if line.hasPrefix("data:") {
                                let piece = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                                currentData = currentData.isEmpty ? piece : "\(currentData)\n\(piece)"
                            }
                        }
                    } catch {
                        if Task.isCancelled { break }
                    }

                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                }

                continuation.finish()
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    private func postAlertDeviceAction(url: URL, deviceId: String) async throws -> AiAlert {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(AlertDeviceBody(deviceId: deviceId))

        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        return try HealthJSONCodec.decoder.decode(AiAlert.self, from: data)
    }

    private static func parseSSEEvent(name: String, data: String) -> AiStreamEvent? {
        guard let jsonData = data.data(using: .utf8) else { return nil }
        switch name {
        case "hello":
            guard let payload = try? HealthJSONCodec.decoder.decode(AiHelloPayload.self, from: jsonData) else { return nil }
            return .hello(alerts: payload.alerts)
        case "alert":
            guard let alert = try? HealthJSONCodec.decoder.decode(AiAlert.self, from: jsonData) else { return nil }
            return .alert(alert)
        case "alert-update":
            guard let alert = try? HealthJSONCodec.decoder.decode(AiAlert.self, from: jsonData) else { return nil }
            return .alertUpdate(alert)
        default:
            return nil
        }
    }

    private func validate(response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else {
            throw NetworkError.badResponse(statusCode: -1)
        }
        guard (200...299).contains(http.statusCode) else {
            throw NetworkError.badResponse(statusCode: http.statusCode)
        }
    }
}
